/**
 * Anti-Bot Markdown Scraper — Cloudflare Worker (Hono + x402 V2)
 *
 * POST /v1/scrape  { "url": "https://example.com" }
 * Price: $0.002 USDC on Base Mainnet (eip155:8453)
 *
 * Unpaid calls must return HTTP 402 + PAYMENT-REQUIRED. The default
 * https://x402.org/facilitator is testnet-only and cannot advertise Base
 * mainnet, which caused 500s when building payment requirements.
 */
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
	paymentMiddlewareFromHTTPServer,
	x402HTTPResourceServer,
	x402ResourceServer,
} from "@x402/hono";
import TurndownService from "turndown";

const PAYOUT_WALLET = "0x84e297F75548ce336C1a7FF6453bD6Dad502D176" as `0x${string}`;

/** Base Mainnet CAIP-2 network id (EVM). */
const BASE_MAINNET = "eip155:8453" as const;

const SCRAPE_PRICE = "$0.002";

/** Production facilitator that lists exact payments on eip155:8453. */
const FACILITATOR_URL = "https://facilitator.payai.network";

const BROWSER_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9",
	"Cache-Control": "no-cache",
} as const;

const STRIP_SELECTORS = ["script", "style", "nav", "footer", "iframe", "noscript"] as const;
const FETCH_TIMEOUT_MS = 15_000;

const scrapeRoutes = {
	"POST /v1/scrape": {
		accepts: {
			scheme: "exact" as const,
			price: SCRAPE_PRICE,
			network: BASE_MAINNET,
			payTo: PAYOUT_WALLET,
		},
		description: "Scrape a public URL and return token-optimized Markdown",
		mimeType: "application/json",
	},
};

const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL })).register(
	BASE_MAINNET,
	new ExactEvmScheme(),
);

const httpServer = new x402HTTPResourceServer(resourceServer, scrapeRoutes);

// false: do not fetch /supported or call process.exit during isolate startup.
const x402 = paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false);

let facilitatorInit: Promise<void> | null = null;

function ensureFacilitatorReady(): Promise<void> {
	if (!facilitatorInit) {
		facilitatorInit = httpServer.initialize().catch((error: unknown) => {
			facilitatorInit = null;
			throw error;
		});
	}
	return facilitatorInit;
}

type AppEnv = {
	Bindings: Env;
	Variables: {
		scrapeUrl: string;
	};
};

const SERVICE_NAME = "scrape-markdown.x402";
const SERVICE_VERSION = "1.0.0";

const LLMS_TXT = `# ${SERVICE_NAME}
> Token-optimized anti-bot web scraper designed for autonomous AI agent tools.

## API Endpoints
- POST /v1/scrape: Converts target web URLs into clean, token-dense Markdown text.

## Pricing
- Protocol: x402 V2
- Price: ${SCRAPE_PRICE} USDC per request
- Network: Base Mainnet
`;

const OPENAPI_SPEC = {
	openapi: "3.1.0",
	info: {
		title: SERVICE_NAME,
		version: SERVICE_VERSION,
		description: "Anti-bot web scraper returning token-optimized Markdown for AI agents.",
	},
	paths: {
		"/v1/scrape": {
			post: {
				operationId: "scrapeToMarkdown",
				summary: "Scrape a URL and return clean Markdown",
				description: `Paid via x402 V2: ${SCRAPE_PRICE} USDC on Base Mainnet (${BASE_MAINNET}). Unpaid requests receive 402 with a PAYMENT-REQUIRED header; retry with a PAYMENT-SIGNATURE header.`,
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["url"],
								properties: {
									url: {
										type: "string",
										format: "uri",
										description: "Target http or https URL to scrape.",
										examples: ["https://example.com"],
									},
								},
								additionalProperties: false,
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Page scraped and converted to Markdown.",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["success", "url", "markdown", "estimated_tokens", "scraped_at"],
									properties: {
										success: { type: "boolean", const: true },
										url: { type: "string", format: "uri" },
										markdown: { type: "string" },
										estimated_tokens: { type: "integer", minimum: 1 },
										scraped_at: { type: "string", format: "date-time" },
									},
								},
							},
						},
					},
					"402": {
						description:
							"Payment required. The base64-encoded x402 V2 PaymentRequired object is in the PAYMENT-REQUIRED header.",
						headers: {
							"PAYMENT-REQUIRED": {
								description: "Base64-encoded JSON x402 V2 payment requirements.",
								schema: { type: "string" },
							},
						},
						content: {
							"application/json": {
								schema: { type: "object" },
							},
						},
					},
				},
			},
		},
	},
} as const;

const app = new Hono<AppEnv>();

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"PAYMENT-SIGNATURE",
			"X-PAYMENT",
			"Mcp-Session-Id",
			"MCP-Protocol-Version",
		],
		exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
	}),
);

app.get("/", (c: Context<AppEnv>) =>
	c.json({
		name: SERVICE_NAME,
		description: "Anti-bot web scraper returning token-optimized Markdown for AI agents.",
		version: SERVICE_VERSION,
		docs: "/llms.txt",
		openapi: "/openapi.json",
		endpoints: {
			scrape: `POST /v1/scrape (${SCRAPE_PRICE} USDC on Base)`,
		},
	}),
);

app.get("/llms.txt", (c: Context<AppEnv>) => c.text(LLMS_TXT));

app.get("/openapi.json", (c: Context<AppEnv>) => c.json(OPENAPI_SPEC));

app.get("/.well-known/mcp/server-card.json", (c: Context<AppEnv>) =>
	c.json(
		{
			serverInfo: {
				name: "scrape-markdown-x402",
				version: SERVICE_VERSION,
			},
			tools: [
				{
					name: "scrape",
					description: `Anti-bot web scraper returning token-optimized Markdown for AI agents (${SCRAPE_PRICE} USDC on Base)`,
					inputSchema: {
						type: "object",
						properties: {
							url: {
								type: "string",
								description: "The URL to scrape",
							},
						},
						required: ["url"],
					},
				},
			],
		},
		200,
	),
);

const MCP_PROTOCOL_VERSION = "2024-11-05";

type JsonRpcId = string | number | null;

function jsonRpcResult(c: Context<AppEnv>, id: JsonRpcId, result: unknown) {
	return c.json({ jsonrpc: "2.0", id, result }, 200);
}

function jsonRpcError(c: Context<AppEnv>, id: JsonRpcId, code: number, message: string) {
	return c.json({ jsonrpc: "2.0", id, error: { code, message } }, 200);
}

async function handleMcp(c: Context<AppEnv>) {
	let message: unknown;
	try {
		message = await c.req.json();
	} catch {
		return jsonRpcError(c, null, -32700, "Parse error");
	}

	if (typeof message !== "object" || message === null || Array.isArray(message)) {
		return jsonRpcError(c, null, -32600, "Invalid Request");
	}

	const { id: rawId, method } = message as { id?: unknown; method?: unknown };
	const id: JsonRpcId = typeof rawId === "string" || typeof rawId === "number" ? rawId : 1;

	if (typeof method !== "string") {
		return jsonRpcError(c, id, -32600, "Invalid Request");
	}

	switch (method) {
		case "initialize":
			return jsonRpcResult(c, id, {
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: { name: "scrape-markdown-x402", version: SERVICE_VERSION },
			});
		case "ping":
			return jsonRpcResult(c, id, {});
		case "tools/list":
			return jsonRpcResult(c, id, { tools: [MCP_SCRAPE_TOOL] });
	}

	// Other id-less messages are notifications (e.g. notifications/initialized) and get no body.
	if (rawId === undefined) {
		return c.body(null, 202);
	}

	return jsonRpcError(c, id, -32601, `Method not found: ${method}`);
}

const MCP_SCRAPE_TOOL = {
	name: "scrape",
	description: `Anti-bot web scraper returning token-optimized Markdown for AI agents (${SCRAPE_PRICE} USDC on Base)`,
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description: "Target website URL",
			},
		},
		required: ["url"],
	},
};

app.post("/", handleMcp);
app.post("/mcp", handleMcp);

// Streamable HTTP: servers without a server-initiated SSE stream answer GET with 405.
app.get("/mcp", (c: Context<AppEnv>) => {
	c.header("Allow", "POST");
	return c.json({ error: "Method Not Allowed" }, 405);
});

// Reject bad JSON / URLs with 400 before x402 so they never become 500s (or paid 402s).
app.use("/v1/scrape", async (c, next) => {
	if (c.req.method !== "POST") {
		return next();
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return invalidUrl();
	}

	const parsed = parseHttpUrl(
		typeof body === "object" && body !== null ? (body as { url?: unknown }).url : undefined,
	);
	if (!parsed) {
		return invalidUrl();
	}

	c.set("scrapeUrl", parsed.href);
	return next();
});

// Load facilitator kinds in the request context, then enforce x402.
app.use("/v1/scrape", async (c, next) => {
	try {
		await ensureFacilitatorReady();
	} catch (error) {
		console.error("x402 facilitator initialize failed", error);
		return c.json({ error: "Payment facilitator unavailable" }, 502);
	}
	return x402(c, next);
});

app.post("/v1/scrape", async (c) => {
	const targetUrl = c.get("scrapeUrl");
	const parsed = parseHttpUrl(targetUrl);
	if (!parsed) {
		return invalidUrl();
	}

	let upstream: Response;
	try {
		upstream = await fetch(parsed.href, {
			method: "GET",
			redirect: "follow",
			headers: BROWSER_HEADERS,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
	} catch {
		return blocked();
	}

	if (!upstream.ok || upstream.status === 403) {
		return blocked();
	}

	try {
		const cleanedHtml = await stripBoilerplate(upstream);
		const markdown = htmlToMarkdown(cleanedHtml);

		return c.json({
			success: true,
			url: parsed.href,
			markdown,
			estimated_tokens: estimateTokens(markdown),
			scraped_at: new Date().toISOString(),
		});
	} catch {
		return blocked();
	}
});

app.onError((error, c) => {
	console.error(error);
	if (isInvalidInputError(error)) {
		return invalidUrl();
	}
	return blocked();
});

export default app;

function invalidUrl(): Response {
	return Response.json({ success: false, error: "INVALID_URL" }, { status: 400 });
}

function isInvalidInputError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		error instanceof SyntaxError ||
		error instanceof TypeError ||
		error.name === "SyntaxError" ||
		error.name === "TypeError" ||
		/json|url/i.test(error.message)
	);
}

function parseHttpUrl(value: unknown): URL | null {
	if (typeof value !== "string") return null;
	const candidate = value.trim();
	if (candidate === "") return null;
	try {
		const url = new URL(candidate);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		if (!url.hostname) return null;
		return url;
	} catch {
		return null;
	}
}

async function stripBoilerplate(response: Response): Promise<string> {
	const rewriter = new HTMLRewriter();
	for (const selector of STRIP_SELECTORS) {
		rewriter.on(selector, {
			element(el) {
				el.remove();
			},
		});
	}
	return rewriter.transform(response).text();
}

function htmlToMarkdown(html: string): string {
	const turndown = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
		bulletListMarker: "-",
	});
	return turndown.turndown(html).trim();
}

function estimateTokens(markdown: string): number {
	return Math.max(1, Math.ceil(markdown.length / 4));
}

function blocked(): Response {
	return Response.json(
		{
			success: false,
			error: "TARGET_SITE_BLOCKED",
			message: "Failed to fetch URL",
		},
		{ status: 502 },
	);
}
