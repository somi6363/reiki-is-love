#!/bin/sh
# End-to-end smoke test against the live preview server. Exits non-zero on
# the first real failure. Uses two accounts to verify isolation.
B=${BASE:-http://127.0.0.1:3210}
J1=/tmp/ril-u1.jar; J2=/tmp/ril-u2.jar; JA=/tmp/ril-admin.jar
rm -f $J1 $J2 $JA
H='-H content-type:application/json -H x-reiki-action:1'
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ fail=$((fail+1)); echo "  ✗ $1"; }
expect(){ # desc expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected $2, got $3)"; fi
}

echo '— auth —'
# Idempotent: accounts may exist from a previous run. Register (may 409),
# then ALWAYS login to guarantee fresh sessions in both jars.
code=$(curl -s -o /dev/null -w '%{http_code}' -H content-type:application/json -d '{"email":"a@b.c","password":"x"}' $B/api/auth/register)
expect 'guard rejects headerless POST' 403 $code
curl -s -c $J1 -o /dev/null $H -d '{"name":"آزمون یک","email":"u1@test.app","password":"passw0rd-long-12"}' $B/api/auth/register
curl -s -c $J2 -o /dev/null $H -d '{"name":"آزمون دو","email":"u2@test.app","password":"passw0rd-long-12"}' $B/api/auth/register
# Duplicate email blocked
code=$(curl -s -o /dev/null -w '%{http_code}' $H -d '{"name":"دوم","email":"u1@test.app","password":"passw0rd-long-12"}' $B/api/auth/register)
expect 'duplicate email rejected' 409 $code
# Short password rejected
code=$(curl -s -o /dev/null -w '%{http_code}' $H -d '{"name":"سوم","email":"u3@test.app","password":"short"}' $B/api/auth/register)
expect 'short password rejected' 400 $code
# Fresh sessions for both users
curl -s -c $J1 -o /dev/null $H -d '{"email":"u1@test.app","password":"passw0rd-long-12"}' $B/api/auth/login
curl -s -c $J2 -o /dev/null $H -d '{"email":"u2@test.app","password":"passw0rd-long-12"}' $B/api/auth/login
# Session works
me=$(curl -s -b $J1 $B/api/auth/me)
echo "$me" | grep -q 'آزمون یک' && ok 'session resolves user' || bad "session: $me"

echo '— journal privacy —'
code=$(curl -s -b $J1 -o /dev/null -w '%{http_code}' $H -d '{"title":"یادداشت خصوصی","body":"راز من","entry_date":"2026-09-17"}' $B/api/account/journal)
expect 'user1 writes journal' 200 $code
j2=$(curl -s -b $J2 $B/api/account/journal)
echo "$j2" | grep -q 'راز من' && bad 'JOURNAL LEAKED to user2' || ok 'journal isolated from user2'
# Guest cannot read
code=$(curl -s -o /dev/null -w '%{http_code}' $B/api/account/journal)
expect 'guest journal denied' 401 $code
# Admin API must have no journal section — 401 (auth) or 404 (no route) both
# prove it's not readable. Probed with u2 (a plain user): a logged-in
# non-admin must never see journal data through an admin route.
curl -s -b $J2 "$B/api/admin/journal" | grep -q 'راز من' && bad 'ADMIN JOURNAL ENDPOINT EXISTS' || ok 'no admin journal data'

echo '— premium lock —'
# Find the premium mantra id (gayatri)
pid=$(curl -s $B/api/catalog/content?type=mantra | python3 -c "import sys,json;d=json.load(sys.stdin);print([i['id'] for i in d if i['access_type']=='premium'][0])")
guest=$(curl -s $B/api/catalog/content?id=$pid)
echo "$guest" | grep -q '"locked":true' && ok 'guest sees premium item locked' || bad 'guest lock missing'
echo "$guest" | grep -q '"body":null' && ok 'locked body withheld' || bad 'BODY LEAKED to guest'
# And it must not appear in search results for guests either
# Persian query must be percent-encoded for curl; both list and search must be redacted.
qenc=$(python3 -c "from urllib.parse import quote;print(quote('گایاتری'))")
curl -s "$B/api/catalog/content?q=$qenc" | grep -q '"locked":true' && ok 'search result redacted' || bad 'search leak'

echo '— favorites —'
curl -s -b $J1 -o /dev/null $H -d "{\"id\":$pid,\"saved\":true}" $B/api/account/favorites
f=$(curl -s -b $J1 $B/api/account/favorites)
echo "$f" | grep -q "\"id\":$pid" && ok 'favorite persisted' || bad "favorite missing: $f"
curl -s -b $J2 $B/api/account/favorites | grep -q "\"id\":$pid" && bad 'favorite leaked to user2' || ok 'favorites isolated'

echo '— course: premium does not unlock; lessons gate —'
cid=$(curl -s $B/api/catalog/courses | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
l2=$(curl -s $B/api/catalog/courses?id=$cid | python3 -c "import sys,json;d=json.load(sys.stdin);print([l['id'] for l in d['lessons'] if l['sort_order']==1][0])")
# u1 is an admin and access.ts deliberately exempts admins from lesson gating
# (reason:'admin'), so this must be probed with u2 — a plain user who neither
# owns the course nor holds an entitlement.
code=$(curl -s -b $J2 -o /dev/null -w '%{http_code}' $H -d "{\"kind\":\"lesson\",\"id\":$l2,\"position\":0,\"done\":true}" $B/api/account/progress)
expect 'non-student cannot complete lesson' 403 $code
# And the admin exemption is real (by design, not a hole): u1 reaches 200.
code=$(curl -s -b $J1 -o /dev/null -w '%{http_code}' $H -d "{\"kind\":\"lesson\",\"id\":$l2,\"position\":0,\"done\":true}" $B/api/account/progress)
expect 'admin exempt from lesson gate (by design)' 200 $code
# Grant course via admin later; premium-only cannot. (Admin flow below.)

echo '— purchase flow: request -> admin approve —'
mid=$(curl -s $B/api/catalog/plans | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
# Probed with u2, a clean account with no history: a request must not confer
# entitlement by itself, so u2's session must still show no premium after
# asking. (u1 holds a genuine legacy 'purchase' entitlement, which would
# make any assertion on u1 ambiguous.)
code=$(curl -s -b $J2 -o /dev/null -w '%{http_code}' $H -d "{\"kind\":\"membership\",\"id\":$mid}" $B/api/account/purchases)
expect 'membership request recorded' 200 $code
curl -s -b $J2 $B/api/auth/me | grep -q premium && bad 'premium granted WITHOUT approval' || ok 'no premium before approval'
# A non-admin (u2) cannot approve the pending purchase.
code=$(curl -s -b $J2 -o /dev/null -w '%{http_code}' $H -d "{\"id\":1}" $B/api/admin/purchases)
expect 'non-admin approval denied' 403 $code

echo '— admin role gates the admin surface —'
# u2 is a plain user: every admin route must refuse with 403, never serve data.
code=$(curl -s -b $J2 -o /dev/null -w '%{http_code}' $B/api/admin/overview)
expect 'non-admin blocked from admin' 403 $code
# Positive proof: u1 was promoted via scripts/make-admin.mjs, so the same
# route must answer 200 for it. Without this, a bug that 403s everyone would
# still pass the block-check above.
code=$(curl -s -b $J1 -o /dev/null -w '%{http_code}' $B/api/admin/overview)
expect 'admin can reach overview' 200 $code

echo '— content ↔ category assignment —'
curl -s -b $J1 $B/api/admin/content | grep -q 'category_ids' && ok 'content rows expose category_ids' || bad 'category_ids missing'
cid=$(curl -s -b $J1 $B/api/admin/categories | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')")
[ -n "$cid" ] || bad 'no categories to assign'
nid=$(curl -s -b $J1 $B/api/admin/content | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
body="{\"id\":$nid,\"type_id\":1,\"slug\":\"smoke-cat-test\",\"title\":\"تست\",\"access_type\":\"free\",\"status\":\"draft\",\"category_ids\":[$cid]}"
curl -s -b $J1 $H -d "$body" $B/api/admin/content | grep -q '"ok":true' && ok 'save with category accepted' || bad 'save with category failed'
back=$(curl -s -b $J1 $B/api/admin/content | python3 -c "import sys,json;d=json.load(sys.stdin);r=[x for x in d if x['id']==$nid][0];print(','.join(map(str,r.get('category_ids') or [])))")
echo "$back" | grep -q "$cid" && ok 'category round-trips' || bad "category lost: got [$back]"
curl -s -b $J1 $H -d "{\"id\":$nid,\"type_id\":1,\"slug\":\"smoke-cat-test\",\"title\":\"تست\",\"access_type\":\"free\",\"status\":\"draft\",\"category_ids\":[999999]}" $B/api/admin/content | grep -q 'دسته' && ok 'invalid category rejected' || bad 'invalid category accepted'
# Omitting category_ids must keep the existing links (no silent detach).
curl -s -b $J1 $H -d "{\"id\":$nid,\"type_id\":1,\"slug\":\"smoke-cat-test\",\"title\":\"تست\",\"access_type\":\"free\",\"status\":\"draft\"}" $B/api/admin/content > /dev/null
back=$(curl -s -b $J1 $B/api/admin/content | python3 -c "import sys,json;d=json.load(sys.stdin);r=[x for x in d if x['id']==$nid][0];print(','.join(map(str,r.get('category_ids') or [])))")
echo "$back" | grep -q "$cid" && ok 'omitting category_ids keeps links' || bad "links lost: [$back]"

echo
echo "RESULT: $pass passed, $fail failed"
[ $fail = 0 ]
