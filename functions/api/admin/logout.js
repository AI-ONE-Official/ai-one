const ALLOWED_ORIGIN = "https://ai-one-a2u.pages.dev";

function jsonResponse(data, status = 200, extraHeaders = {}) {
return new Response(JSON.stringify(data), {
status,
headers: {
"Content-Type": "application/json; charset=utf-8",
"Cache-Control": "no-store",
"X-Content-Type-Options": "nosniff",
...extraHeaders
}
});
}

export async function onRequestPost({ request }) {
const origin = request.headers.get("Origin");

if (origin !== ALLOWED_ORIGIN) {
return jsonResponse(
{
success: false,
message: "Forbidden"
},
403
);
}

return jsonResponse(
{
success: true,
message: "Logged out successfully"
},
200,
{
"Set-Cookie":
"ai_one_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
}
);
}
