import { EditorInputError } from "./editorErrors.service";
import { readFileSync } from "node:fs";
import {
  hashSecret,
  newSecret,
  type OrganizationSettings,
  type GuildActor,
} from "./organizationSettings.service";
import { editorCardTheme, validateEditorTheme } from "./editorTheme.service";
import generateRankCard from "./generateRankCard.service";
import generateBoard from "./generateLeaderboardCard.service";
import generateAverage from "./generateAverageCard.service";
import { previewInput } from "./themePreview.service";
export interface EditorWebOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  store: OrganizationSettings;
  authorize(
    guild: string,
    user: string,
    signal: AbortSignal,
  ): Promise<GuildActor>;
  ioTimeoutMs?: number;
  exchangeCode?: (
    code: string,
    redirect: string,
    signal: AbortSignal,
  ) => Promise<string>;
}
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const sessionCookie = "__Host-rl_editor",
  flowCookie = "__Host-rl_oauth";
const cookie = (name: string, value: string, seconds: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(seconds))}`;
function cookies(req: Request) {
  return Object.fromEntries(
    (req.headers.get("cookie") || "")
      .split(";")
      .map((v) => v.trim().split("="))
      .filter((v) => v.length === 2),
  );
}
const security = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
function response(
  body: BodyInit | Buffer | null,
  status = 200,
  headers: HeadersInit = {},
) {
  const h = new Headers(security);
  new Headers(headers).forEach((v, k) => h.set(k, v));
  return new Response(
    body instanceof Uint8Array ? new Uint8Array(body).buffer : body,
    { status, headers: h },
  );
}
const json = (body: unknown, status = 200) =>
  response(JSON.stringify(body), status, {
    "Content-Type": "application/json",
  });
function redirect(url: string, setCookie?: string) {
  return response(null, 302, {
    Location: url,
    ...(setCookie ? { "Set-Cookie": setCookie } : {}),
  });
}
async function body(req: Request, timeoutMs: number) {
  if (
    req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "Send JSON.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  let expired = false;
  const expire = () => {
    expired = true;
    void reader.cancel().catch(() => {});
  };
  const timer = setTimeout(expire, timeoutMs);
  req.signal.addEventListener("abort", expire, { once: true });
  try {
    if (req.signal.aborted) expire();
    for (;;) {
      const r = await reader.read();
      if (expired)
        throw new HttpError(408, "This request timed out. Try again.");
      if (r.done) break;
      size += r.value.length;
      if (size > 16384) {
        void reader.cancel().catch(() => {});
        throw new HttpError(413, "Theme request is too large.");
      }
      chunks.push(r.value);
    }
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", expire);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new HttpError(400, "Invalid theme request.");
  }
}
export function createThemeEditorHandler(options: EditorWebOptions) {
  const { store } = options,
    base = new URL(options.baseUrl);
  if (
    base.protocol !== "https:" ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    base.username ||
    base.password ||
    !/^\d{17,20}$/.test(options.clientId) ||
    !options.clientSecret
  )
    throw new Error(
      "Configure an HTTPS editor origin and Discord OAuth credentials.",
    );
  const origin = base.origin,
    callback = origin + "/oauth/callback";
  const assets = new Map<string, { body: Buffer; type: string }>([
    [
      "/assets/editor.js",
      {
        body: readFileSync(new URL("../web/editor.js", import.meta.url)),
        type: "text/javascript",
      },
    ],
    [
      "/assets/editor.css",
      {
        body: readFileSync(new URL("../web/editor.css", import.meta.url)),
        type: "text/css",
      },
    ],
    [
      "/assets/inter.ttf",
      {
        body: readFileSync(
          new URL("../assets/fonts/InterVariable.ttf", import.meta.url),
        ),
        type: "font/ttf",
      },
    ],
  ]);
  const html = readFileSync(new URL("../web/editor.html", import.meta.url));
  let active = 0,
    renders = 0,
    authActive = 0;
  const ioTimeout = Math.max(10, Math.min(options.ioTimeoutMs ?? 10000, 10000));
  async function deadline<T>(
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let rejectTimeout: (error: Error) => void = () => {};
    const timeout = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timer = setTimeout(() => {
      controller.abort();
      rejectTimeout(
        new HttpError(504, "Discord is taking too long. Try again."),
      );
    }, ioTimeout);
    try {
      return await Promise.race([work(controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
  const rates = new Map<string, { at: number; n: number }>();
  function throttle(key: string, max = 60) {
    const now = store.now();
    for (const [k, v] of rates) if (now - v.at >= 60000) rates.delete(k);
    const r = rates.get(key) || { at: now, n: 0 };
    if (++r.n > max)
      throw new HttpError(429, "Slow down for a moment and try again.");
    if (rates.size >= 2000 && !rates.has(key))
      throw new HttpError(503, "The editor is busy. Try again shortly.");
    rates.set(key, r);
  }
  async function authorize(linkHash: string, user: string) {
    const link = store.linkHash(linkHash);
    if (link.user_id !== user)
      throw new HttpError(
        403,
        "Sign in with the Discord account that requested this link.",
      );
    let actor: GuildActor;
    try {
      actor = await deadline((signal) =>
        options.authorize(link.guild_id, user, signal),
      );
    } catch {
      throw new HttpError(
        403,
        "Couldn't verify your server permissions. Try again in Discord.",
      );
    }
    if (actor.id !== user || !store.can(link.guild_id, actor, "themes"))
      throw new HttpError(
        403,
        "You no longer have permission to edit this server's themes.",
      );
    store.linkHash(linkHash);
    return link;
  }
  async function exchange(code: string, signal: AbortSignal) {
    if (options.exchangeCode)
      return options.exchangeCode(code, callback, signal);
    const token = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: callback,
      }),
      signal,
    });
    if (!token.ok)
      throw new HttpError(
        401,
        "Discord sign-in failed. Request a new sign-in from your editor link.",
      );
    const t = (await token.json()) as any;
    if (typeof t.access_token !== "string")
      throw new HttpError(401, "Discord sign-in failed.");
    const user = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${t.access_token}` },
      signal,
    });
    if (!user.ok) throw new HttpError(401, "Discord sign-in failed.");
    const u = (await user.json()) as any;
    if (!/^\d{17,20}$/.test(u.id))
      throw new HttpError(401, "Discord sign-in failed.");
    // User access/refresh tokens remain transient; persistent editor sessions are local.
    return u.id as string;
  }
  async function route(req: Request) {
    const url = new URL(req.url),
      path = url.pathname;
    // The configured public origin is authoritative; never construct redirects from forwarded headers.
    if (url.host !== base.host)
      throw new HttpError(421, "Unknown editor host.");
    if (path === "/health" && req.method === "GET") return json({ ok: true });
    const asset = assets.get(path);
    if (asset && req.method === "GET")
      return response(asset.body, 200, { "Content-Type": asset.type });
    if (path.startsWith("/auth/start/") && req.method === "GET") {
      const link = store.link(path.slice(12));
      throttle(link.token_hash + ":login", 10);
      store.cleanup();
      const count = store.db
        .query("SELECT COUNT(*) AS n FROM theme_editor_auth WHERE link_hash=?")
        .get(link.token_hash) as any;
      if (count.n >= 20)
        throw new HttpError(
          429,
          "Too many sign-in attempts. Request a fresh editor link.",
        );
      const state = newSecret(),
        browser = newSecret();
      store.db
        .query(
          "INSERT INTO theme_editor_auth(secret_hash,kind,link_hash,browser_hash,expires_at) VALUES (?,'state',?,?,?)",
        )
        .run(
          hashSecret(state),
          link.token_hash,
          hashSecret(browser),
          Math.min(store.now() + 600000, link.expires_at),
        );
      const auth = new URL("https://discord.com/oauth2/authorize");
      auth.search = new URLSearchParams({
        response_type: "code",
        client_id: options.clientId,
        scope: "identify",
        state,
        redirect_uri: callback,
      }).toString();
      return redirect(auth.toString(), cookie(flowCookie, browser, 600));
    }
    if (path === "/oauth/callback" && req.method === "GET") {
      if (authActive >= 4)
        throw new HttpError(503, "Sign-in is busy. Try again shortly.");
      authActive++;
      try {
        const state = url.searchParams.get("state") || "",
          browser = cookies(req)[flowCookie] || "";
        if (!/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(browser))
          throw new HttpError(401, "Sign-in expired. Reopen your editor link.");
        const record = store.db.transaction(() => {
          const r = store.db
            .query(
              "SELECT * FROM theme_editor_auth WHERE secret_hash=? AND kind='state'",
            )
            .get(hashSecret(state)) as any;
          if (
            !r ||
            r.expires_at <= store.now() ||
            r.browser_hash !== hashSecret(browser)
          )
            throw new HttpError(
              401,
              "Sign-in expired. Reopen your editor link.",
            );
          store.db
            .query("DELETE FROM theme_editor_auth WHERE secret_hash=?")
            .run(hashSecret(state));
          return r;
        })();
        store.linkHash(record.link_hash);
        if (url.searchParams.has("error"))
          throw new HttpError(
            401,
            "Discord sign-in was cancelled. Reopen your editor link to try again.",
          );
        const code = url.searchParams.get("code");
        if (
          !code ||
          code.length > 2048 ||
          (url.searchParams.has("iss") &&
            url.searchParams.get("iss") !== "https://discord.com")
        )
          throw new HttpError(401, "Invalid Discord sign-in.");
        const user = await deadline((signal) => exchange(code, signal)),
          link = await authorize(record.link_hash, user),
          session = newSecret(),
          csrf = newSecret();
        store.db
          .query(
            "INSERT INTO theme_editor_auth(secret_hash,kind,link_hash,browser_hash,user_id,csrf,expires_at) VALUES (?,'session',?,'',?,?,?)",
          )
          .run(
            hashSecret(session),
            link.token_hash,
            user,
            csrf,
            link.expires_at,
          );
        return redirect(
          origin + "/editor",
          cookie(
            sessionCookie,
            session,
            (link.expires_at - store.now()) / 1000,
          ),
        );
      } finally {
        authActive--;
      }
    }
    if (path.startsWith("/editor/") && req.method === "GET") {
      const token = path.slice(8);
      store.link(token);
      return response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/editor.css"><title>Organization theme editor</title><main class="welcome"><p class="eyebrow">AYLIAN STUDIOS / TRACKER</p><h1>Your team's signature.</h1><p>Sign in with the Discord account that requested this editor.</p><a class="primary" href="/auth/start/${token}">Continue with Discord</a><p class="subtle">Private editor · link valid for 24 hours</p></main></html>`,
        200,
        { "Content-Type": "text/html; charset=utf-8" },
      );
    }
    if (path === "/editor" && req.method === "GET")
      return response(html, 200, {
        "Content-Type": "text/html; charset=utf-8",
      });
    if (path === "/" && req.method === "GET")
      return response(
        "Organization editors are opened from /theme editor in Discord.",
        200,
        { "Content-Type": "text/plain" },
      );
    if (path.startsWith("/api/")) {
      if (!["GET", "POST"].includes(req.method))
        throw new HttpError(405, "Method not allowed.");
      if (active >= 8)
        throw new HttpError(503, "The editor is busy. Try again shortly.");
      active++;
      try {
        const secret = cookies(req)[sessionCookie] || "";
        if (!/^[\w-]{43}$/.test(secret))
          throw new HttpError(
            401,
            "Open your editor link and sign in with Discord.",
          );
        const session = store.db
          .query(
            "SELECT * FROM theme_editor_auth WHERE secret_hash=? AND kind='session'",
          )
          .get(hashSecret(secret)) as any;
        if (!session || session.expires_at <= store.now())
          throw new HttpError(
            401,
            "Your editor session expired. Request a new link in Discord.",
          );
        throttle(hashSecret(secret));
        if (
          req.method === "POST" &&
          (req.headers.get("origin") !== origin ||
            req.headers.get("x-csrf-token") !== session.csrf)
        )
          throw new HttpError(
            403,
            "This request didn't come from your editor. Reload and try again.",
          );
        if (path === "/api/theme" && req.method === "GET") {
          const link = await authorize(session.link_hash, session.user_id);
          return json({
            ...store.draft(link.guild_id),
            csrf: session.csrf,
            expiresAt: link.expires_at,
          });
        }
        if (req.method !== "POST") throw new HttpError(404, "Page not found.");
        const data = await body(req, ioTimeout);
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new HttpError(400, "Invalid theme request.");
        const link = await authorize(session.link_hash, session.user_id),
          guild = link.guild_id;
        if (path === "/api/save")
          return json(
            store.save(guild, session.user_id, data.revision, data.theme),
          );
        if (path === "/api/apply")
          return json({
            themeId: store.publish(guild, session.user_id, data.revision),
          });
        if (path === "/api/preview") {
          if (renders >= 2)
            throw new HttpError(
              429,
              "Previews are busy. Try again in a moment.",
            );
          renders++;
          try {
            const theme = editorCardTheme(validateEditorTheme(data.theme)),
              input = { ...previewInput("rose"), theme };
            let image;
            if (data.kind === "rank") image = await generateRankCard(input);
            else if (data.kind === "leaderboard")
              image = (
                await generateBoard(
                  [
                    {
                      discord_id: "sample",
                      playername: "Aether",
                      stats_data: input.ranks,
                    },
                  ],
                  "competitive",
                  "Organization preview",
                  true,
                  theme,
                )
              )[0];
            else if (data.kind === "history")
              image = (
                await generateAverage({
                  name: "Organization preview",
                  preview: true,
                  theme,
                  seasonData: [
                    {
                      season: "S22",
                      playlists: Object.fromEntries(
                        input.ranks
                          .slice(0, 4)
                          .map((r) => [
                            r.playlist,
                            { rank: r.rank, matches: r.matches },
                          ]),
                      ),
                    },
                  ],
                })
              )[0];
            else
              throw new HttpError(400, "Choose rank, leaderboard or history.");
            await authorize(session.link_hash, session.user_id);
            return response(image.attachment as Buffer, 200, {
              "Content-Type": "image/png",
            });
          } finally {
            renders--;
          }
        }
        throw new HttpError(404, "Page not found.");
      } finally {
        active--;
      }
    }
    throw new HttpError(404, "Page not found.");
  }
  return async (req: Request) => {
    try {
      return await route(req);
    } catch (e) {
      const status =
        e instanceof HttpError
          ? e.status
          : e instanceof EditorInputError
            ? 400
            : 500;
      const message =
        e instanceof HttpError || e instanceof EditorInputError
          ? e.message
          : "Couldn't complete this request. Please try again.";
      if (new URL(req.url).pathname.startsWith("/api/"))
        return json({ error: message }, status);
      // Text response avoids reflecting OAuth/query input as executable markup.
      return response(message, status, {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }
  };
}
