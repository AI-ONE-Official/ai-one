
import { isAdminAuthenticated } from "./_auth.js";

export async function onRequestGet({ request, env }) {
  const authenticated = await isAdminAuthenticated(
    request,
    env
  );

  if (!authenticated) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Unauthorized"
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      authenticated: true,
      role: "admin"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
