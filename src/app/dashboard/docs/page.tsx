"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Copy,
  Check,
  Terminal,
  Code2,
  BookOpen,
  Sparkles,
  Cpu,
  KeyRound,
  Globe,
  Zap,
  Eye,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  ModalDialog,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { getGatewayV1Url } from "@/lib/utils";
import type { ModelRecord, ProviderRecord } from "@/types";

interface LanguageSpec {
  id: string;
  label: string;
  badge: string;
  installCmd?: string;
  generateCode: (params: {
    baseUrl: string;
    apiKey: string;
    model: string;
    stream: boolean;
  }) => string;
}

const LANGUAGES: LanguageSpec[] = [
  {
    id: "python-openai",
    label: "Python (OpenAI SDK)",
    badge: "python",
    installCmd: "pip install openai --break-system-packages",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      stream
        ? `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
)

response = client.chat.completions.create(
    model="${model}",
    messages=[
        {"role": "system", "content": "You are a helpful AI assistant."},
        {"role": "user", "content": "Hello! Explain how you work briefly."},
    ],
    stream=True,
)

for chunk in response:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()`
        : `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
)

response = client.chat.completions.create(
    model="${model}",
    messages=[
        {"role": "system", "content": "You are a helpful AI assistant."},
        {"role": "user", "content": "Hello! Explain how you work briefly."},
    ],
    stream=False,
)

print(response.choices[0].message.content)`,
  },
  {
    id: "python-requests",
    label: "Python (Requests)",
    badge: "python",
    installCmd: "pip install requests",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      stream
        ? `import json
import requests

url = "${baseUrl}/chat/completions"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json",
}
payload = {
    "model": "${model}",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": True,
}

with requests.post(url, headers=headers, json=payload, stream=True) as r:
    r.raise_for_status()
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        data_str = line[6:].strip()
        if data_str == "[DONE]":
            break
        chunk = json.loads(data_str)
        delta = chunk["choices"][0]["delta"].get("content", "")
        print(delta, end="", flush=True)
print()`
        : `import requests

url = "${baseUrl}/chat/completions"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json",
}
payload = {
    "model": "${model}",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": False,
}

response = requests.post(url, headers=headers, json=payload)
response.raise_for_status()
data = response.json()
print(data["choices"][0]["message"]["content"])`,
  },
  {
    id: "nodejs-openai",
    label: "Node.js / TypeScript (OpenAI SDK)",
    badge: "typescript",
    installCmd: "npm install openai",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      stream
        ? `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

async function main() {
  const stream = await client.chat.completions.create({
    model: "${model}",
    messages: [{ role: "user", content: "Hello!" }],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(content);
  }
}

main();`
        : `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

async function main() {
  const response = await client.chat.completions.create({
    model: "${model}",
    messages: [{ role: "user", content: "Hello!" }],
    stream: false,
  });

  console.log(response.choices[0].message.content);
}

main();`,
  },
  {
    id: "js-fetch",
    label: "JavaScript (Fetch API)",
    badge: "javascript",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      stream
        ? `const response = await fetch("${baseUrl}/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKey}",
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: "Hello!" }],
    stream: true,
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const lines = decoder.decode(value).split("\\n");
  for (const line of lines) {
    if (line.startsWith("data: ") && line !== "data: [DONE]") {
      const chunk = JSON.parse(line.slice(6));
      const text = chunk.choices?.[0]?.delta?.content || "";
      process.stdout.write(text);
    }
  }
}`
        : `const response = await fetch("${baseUrl}/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKey}",
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: "Hello!" }],
    stream: false,
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);`,
  },
  {
    id: "vercel-ai",
    label: "Vercel AI SDK",
    badge: "typescript",
    installCmd: "npm install ai @ai-sdk/openai",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      stream
        ? `import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const gateway = createOpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

const result = streamText({
  model: gateway("${model}"),
  prompt: "Hello!",
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}`
        : `import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const gateway = createOpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

const { text } = await generateText({
  model: gateway("${model}"),
  prompt: "Hello!",
});

console.log(text);`,
  },
  {
    id: "langchain",
    label: "LangChain (Python)",
    badge: "python",
    installCmd: "pip install langchain-openai",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      stream
        ? `from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
    model="${model}",
    streaming=True,
)

for chunk in llm.stream("Hello!"):
    print(chunk.content, end="", flush=True)
print()`
        : `from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
    model="${model}",
)

response = llm.invoke("Hello!")
print(response.content)`,
  },
  {
    id: "curl",
    label: "cURL / Bash",
    badge: "bash",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `curl ${stream ? "-N " : ""}${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${model}",
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ],
    "stream": ${stream}
  }'`,
  },
  {
    id: "go",
    label: "Go (Golang)",
    badge: "go",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

func main() {
	payload := []byte(\`{
		"model": "${model}",
		"messages": [{"role": "user", "content": "Hello!"}],
		"stream": ${stream}
	}\`)

	req, _ := http.NewRequest("POST", "${baseUrl}/chat/completions", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer ${apiKey}")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`,
  },
  {
    id: "rust",
    label: "Rust (Reqwest)",
    badge: "rust",
    installCmd: "cargo add reqwest tokio serde_json --features reqwest/json,tokio/full",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `use reqwest::Client;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let res = client
        .post("${baseUrl}/chat/completions")
        .bearer_auth("${apiKey}")
        .json(&json!({
            "model": "${model}",
            "messages": [{"role": "user", "content": "Hello!"}],
            "stream": ${stream}
        }))
        .send()
        .await?;

    println!("{}", res.text().await?);
    Ok(())
}`,
  },
  {
    id: "java",
    label: "Java (HttpClient)",
    badge: "java",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class GatewayClient {
    public static void main(String[] args) throws Exception {
        String body = """
            {
              "model": "${model}",
              "messages": [{"role": "user", "content": "Hello!"}],
              "stream": ${stream}
            }
            """;

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("${baseUrl}/chat/completions"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer ${apiKey}")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> response = HttpClient.newHttpClient()
            .send(request, HttpResponse.BodyHandlers.ofString());

        System.out.println(response.body());
    }
}`,
  },
  {
    id: "csharp",
    label: "C# / .NET",
    badge: "csharp",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `using System.Net.Http.Headers;
using System.Text;

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", "${apiKey}");

var json = """
{
  "model": "${model}",
  "messages": [{"role": "user", "content": "Hello!"}],
  "stream": ${stream}
}
""";

var response = await client.PostAsync(
    "${baseUrl}/chat/completions",
    new StringContent(json, Encoding.UTF8, "application/json")
);

Console.WriteLine(await response.Content.ReadAsStringAsync());`,
  },
  {
    id: "php",
    label: "PHP (cURL)",
    badge: "php",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `<?php
$ch = curl_init("${baseUrl}/chat/completions");
$payload = json_encode([
    "model" => "${model}",
    "messages" => [
        ["role" => "user", "content" => "Hello!"]
    ],
    "stream" => ${stream}
]);

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "Authorization: Bearer ${apiKey}"
    ],
    CURLOPT_POSTFIELDS => $payload
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;`,
  },
  {
    id: "ruby",
    label: "Ruby (Net::HTTP)",
    badge: "ruby",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `require "net/http"
require "uri"
require "json"

uri = URI.parse("${baseUrl}/chat/completions")
request = Net::HTTP::Post.new(uri)
request.content_type = "application/json"
request["Authorization"] = "Bearer ${apiKey}"
request.body = JSON.dump({
  "model" => "${model}",
  "messages" => [{ "role" => "user", "content" => "Hello!" }],
  "stream" => ${stream}
})

response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|
  http.request(request)
end

puts response.body`,
  },
  {
    id: "kotlin",
    label: "Kotlin / Android (OkHttp)",
    badge: "kotlin",
    installCmd: 'implementation("com.squareup.okhttp3:okhttp:4.12.0")',
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

fun main() {
    val client = OkHttpClient()
    val json = """
        {
          "model": "${model}",
          "messages": [{"role": "user", "content": "Hello!"}],
          "stream": ${stream}
        }
    """.trimIndent()

    val request = Request.Builder()
        .url("${baseUrl}/chat/completions")
        .addHeader("Authorization", "Bearer ${apiKey}")
        .post(json.toRequestBody("application/json".toMediaType()))
        .build()

    client.newCall(request).execute().use { response ->
        println(response.body?.string())
    }
}`,
  },
  {
    id: "swift",
    label: "Swift / iOS (URLSession)",
    badge: "swift",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `import Foundation

let url = URL(string: "${baseUrl}/chat/completions")!
var request = URLRequest(url: url)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.setValue("Bearer ${apiKey}", forHTTPHeaderField: "Authorization")

let body: [String: Any] = [
    "model": "${model}",
    "messages": [["role": "user", "content": "Hello!"]],
    "stream": ${stream}
]
request.httpBody = try? JSONSerialization.data(withJSONObject: body)

let (data, _) = try await URLSession.shared.data(for: request)
print(String(data: data, encoding: .utf8) ?? "")`,
  },
  {
    id: "dart",
    label: "Dart / Flutter",
    badge: "dart",
    installCmd: "flutter pub add http",
    generateCode: ({ baseUrl, apiKey, model, stream }) =>
      `import 'dart:convert';
import 'package:http/http.dart' as http;

Future<void> main() async {
  final response = await http.post(
    Uri.parse('${baseUrl}/chat/completions'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ${apiKey}',
    },
    body: jsonEncode({
      'model': '${model}',
      'messages': [
        {'role': 'user', 'content': 'Hello!'}
      ],
      'stream': ${stream},
    }),
  );

  print(response.body);
}`,
  },
];

export default function DocumentationPage() {
  const { toast } = useToast();
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedModel, setSelectedModel] = useState<string>("gemma4:31b-cloud");
  const [apiKey, setApiKey] = useState<string>(
    "gw_live_sample_key_12345"
  );
  const [streamMode, setStreamMode] = useState<boolean>(true);
  const [activeLangId, setActiveLangId] = useState<string>("python-openai");

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedModel, setCopiedModel] = useState<string | null>(null);
  const [copiedLlm, setCopiedLlm] = useState(false);
  const [llmModalOpen, setLlmModalOpen] = useState(false);

  const baseUrl = useMemo(() => getGatewayV1Url(), []);

  useEffect(() => {
    async function fetchDocsData() {
      try {
        const [modelsRes, providersRes] = await Promise.all([
          fetch("/api/models"),
          fetch("/api/providers"),
        ]);
        if (modelsRes.ok) {
          const mData = await modelsRes.json();
          const enabledModels = (mData.models || []).filter(
            (m: ModelRecord) => m.enabled
          );
          setModels(enabledModels);
          if (
            enabledModels.length > 0 &&
            !enabledModels.some((m: ModelRecord) => m.public_id === selectedModel)
          ) {
            setSelectedModel(enabledModels[0].public_id);
          }
        }
        if (providersRes.ok) {
          const pData = await providersRes.json();
          setProviders(pData.providers || []);
        }
      } catch {
        // Fallback if offline
      }
    }
    fetchDocsData();
  }, [selectedModel]);

  const filteredModels = useMemo(() => {
    if (selectedProvider === "all") return models;
    return models.filter((m) => m.provider_id === selectedProvider);
  }, [models, selectedProvider]);

  const handleProviderChange = (nextProvider: string) => {
    setSelectedProvider(nextProvider);
    const nextList =
      nextProvider === "all"
        ? models
        : models.filter((m) => m.provider_id === nextProvider);
    if (nextList.length > 0) {
      setSelectedModel(nextList[0].public_id);
    }
  };

  const activeLang = useMemo(
    () => LANGUAGES.find((l) => l.id === activeLangId) || LANGUAGES[0],
    [activeLangId]
  );

  const generatedCode = useMemo(
    () =>
      activeLang.generateCode({
        baseUrl,
        apiKey: apiKey.trim() || "sk_live_xxxxxxxxx",
        model: selectedModel || "gemini-fast",
        stream: streamMode,
      }),
    [activeLang, baseUrl, apiKey, selectedModel, streamMode]
  );

  const geminiModels = useMemo(
    () => models.filter((m) => m.provider_id === "gemini"),
    [models]
  );
  const ollamaModels = useMemo(
    () => models.filter((m) => m.provider_id === "ollama"),
    [models]
  );

  const llmMarkdownPrompt = useMemo(() => {
    const geminiList =
      geminiModels.length > 0
        ? geminiModels.map((m) => `- \`${m.public_id}\` (${m.type})`).join("\n")
        : `- \`gemini-fast\`\n- \`gemini-pro\`\n- \`gemini-thinking\``;

    const ollamaList =
      ollamaModels.length > 0
        ? ollamaModels.map((m) => `- \`${m.public_id}\` (${m.type})`).join("\n")
        : `- \`gemma4:31b-cloud\`\n- \`gpt-oss:120b-cloud\`\n- \`gpt-oss:20b-cloud\`\n- \`nemotron-3-nano:30b-cloud\``;

    return `# Private AI API Gateway — LLM Integration Context

Use the following OpenAI-compatible API Gateway configuration in my project. Do NOT install Ollama or Gemini scrapers in client projects; call this gateway directly using any OpenAI-compatible SDK or HTTP client.

## 1. Connection Credentials
- **BASE_URL**: \`${baseUrl}\`
- **API_KEY**: \`${apiKey.trim() || "sk_live_xxxxxxxxx"}\`
- **DEFAULT_MODEL**: \`${selectedModel}\`
- **STREAMING**: \`${streamMode}\` (\`stream: true\` for SSE chunks, \`stream: false\` for single JSON response)

## 2. Available Models

### Gemini Web2API Models
${geminiList}

### Ollama Cloud Models
${ollamaList}

## 3. API Endpoints
- \`GET ${baseUrl}/models\` — Lists all enabled models (\`Authorization: Bearer ${apiKey.trim() || "sk_live_xxxxxxxxx"}\`)
- \`POST ${baseUrl}/chat/completions\` — OpenAI-compatible chat completions endpoint supporting \`model\`, \`messages\`, \`stream\` (\`true\` / \`false\`), \`temperature\`, \`top_p\`, and \`max_tokens\`.

## 4. Reference Implementation (Python)
\`\`\`python
from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey.trim() || "sk_live_xxxxxxxxx"}",
)

response = client.chat.completions.create(
    model="${selectedModel}",
    messages=[
        {"role": "system", "content": "You are a helpful AI assistant."},
        {"role": "user", "content": "Hello!"},
    ],
    stream=${streamMode ? "True" : "False"},
)

${
  streamMode
    ? `for chunk in response:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()`
    : `print(response.choices[0].message.content)`
}
\`\`\`

## 5. Reference Implementation (TypeScript / Node.js)
\`\`\`typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey.trim() || "sk_live_xxxxxxxxx"}",
});

const response = await client.chat.completions.create({
  model: "${selectedModel}",
  messages: [{ role: "user", content: "Hello!" }],
  stream: ${streamMode},
});
\`\`\`
`;
  }, [baseUrl, apiKey, selectedModel, streamMode, geminiModels, ollamaModels]);

  const handleCopyForLlm = async () => {
    await navigator.clipboard.writeText(llmMarkdownPrompt);
    setCopiedLlm(true);
    toast({
      title: "Copied Full Docs for LLM!",
      description:
        "Paste directly into Cursor, Windsurf, ChatGPT, Claude, or any AI coding assistant.",
      variant: "success",
    });
    setTimeout(() => setCopiedLlm(false), 2500);
  };

  const handleCopyModel = async (modelId: string) => {
    await navigator.clipboard.writeText(modelId);
    setCopiedModel(modelId);
    toast({
      title: "Model Name Copied",
      description: `Copied "${modelId}" to clipboard`,
      variant: "success",
    });
    setTimeout(() => setCopiedModel(null), 2000);
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(generatedCode);
    setCopiedCode(true);
    toast({
      title: "Code Copied",
      description: `Copied ${activeLang.label} snippet to clipboard`,
      variant: "success",
    });
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyInstall = async (cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header with "Copy for LLM" Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            API Documentation & Multi-Language SDK Guide
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zero client setup required — pick your provider, copy a model ID,
            and call <code className="font-mono">{baseUrl}</code> from any
            programming language.
          </p>
        </div>

        {/* Top Copy for LLM Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLlmModalOpen(true)}
            title="Preview LLM Markdown context"
          >
            <Eye className="h-4 w-4" />
            Preview LLM Prompt
          </Button>
          <Button
            variant="default"
            size="default"
            onClick={handleCopyForLlm}
            className="gap-2 shadow-sm"
          >
            {copiedLlm ? (
              <>
                <Check className="h-4 w-4 text-emerald-300" />
                Copied for LLM!
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Copy for LLM
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Interactive Configuration Builder */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <CardTitle>Interactive Request Builder</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-xs w-fit">
              BASE_URL: {baseUrl}
            </Badge>
          </div>
          <CardDescription>
            Select your provider, model, API key, and streaming mode below — all
            16 language examples and the &ldquo;Copy for LLM&rdquo; prompt
            update automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 1. Provider Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-provider" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                1. Select Provider
              </Label>
              <select
                id="doc-provider"
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All Providers ({models.length})</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Model Selector + Copy Model Button */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-model" className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                2. Select Model
              </Label>
              <div className="flex items-center gap-1.5">
                <select
                  id="doc-model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.public_id}>
                      {m.public_id} ({m.provider_id})
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyModel(selectedModel)}
                  title="Copy selected model name"
                  className="shrink-0 h-9 px-2.5"
                >
                  {copiedModel === selectedModel ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {/* 3. API Key Input */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-apikey" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                3. Gateway API Key
              </Label>
              <Input
                id="doc-apikey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_live_xxxxxxxxx"
                className="font-mono text-xs"
              />
            </div>

            {/* 4. Streaming Toggle */}
            <div className="space-y-1.5 flex flex-col justify-between">
              <Label className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                4. Streaming Mode
              </Label>
              <div className="flex items-center justify-between rounded-md border px-3 h-9 bg-muted/20">
                <span className="font-mono text-xs font-medium">
                  stream: {streamMode ? "true" : "false"}
                </span>
                <Switch
                  checked={streamMode}
                  onCheckedChange={setStreamMode}
                  ariaLabel="Toggle stream mode"
                />
              </div>
            </div>
          </div>

          {/* Quick-Copy Active Models Bar */}
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Click any model below to select & copy its Model ID:
              </span>
              <span className="text-[11px] text-muted-foreground">
                {filteredModels.length} active models
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredModels.map((m) => {
                const isSelected = m.public_id === selectedModel;
                const isCopied = copiedModel === m.public_id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedModel(m.public_id);
                      handleCopyModel(m.public_id);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border bg-background hover:bg-muted text-foreground"
                    }`}
                  >
                    <span>{m.public_id}</span>
                    {isCopied ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3 opacity-60" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Language Selector & Code Viewer */}
      <Card>
        <CardHeader className="border-b bg-muted/20 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <CardTitle>Every Language Integration</CardTitle>
              <Badge variant="outline" className="font-mono text-[10px]">
                {activeLang.badge}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="default" size="sm" onClick={handleCopyCode}>
                {copiedCode ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                    Copied Code
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy {activeLang.label} Code
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Language Pills */}
          <div className="flex flex-wrap gap-1.5 pt-3">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => setActiveLangId(lang.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeLangId === lang.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background border hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {activeLang.installCmd && (
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs font-mono">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-muted-foreground select-none">$</span>
                <span>{activeLang.installCmd}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopyInstall(activeLang.installCmd!)}
                className="h-7 px-2 text-xs"
              >
                {copiedInstall ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy Install
                  </>
                )}
              </Button>
            </div>
          )}

          <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed bg-card">
            <code>{generatedCode}</code>
          </pre>
        </CardContent>
      </Card>

      {/* Endpoint & Error Reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <CardTitle>OpenAI-Compatible Endpoints</CardTitle>
            </div>
            <CardDescription>
              Standard endpoints exposed by your gateway router.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-md border p-3 bg-muted/20 space-y-1">
              <div className="flex items-center justify-between">
                <Badge variant="success" className="font-mono">
                  POST /v1/chat/completions
                </Badge>
                <span className="text-muted-foreground">
                  SSE Stream & JSON
                </span>
              </div>
              <p className="text-muted-foreground pt-1">
                Routes requests to Gemini Web2API or Ollama Cloud based on the{" "}
                <code className="font-mono">model</code> parameter. Supports{" "}
                <code className="font-mono">stream: true | false</code>.
              </p>
            </div>

            <div className="rounded-md border p-3 bg-muted/20 space-y-1">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="font-mono">
                  GET /v1/models
                </Badge>
                <span className="text-muted-foreground">Model Discovery</span>
              </div>
              <p className="text-muted-foreground pt-1">
                Returns all enabled models in OpenAI{" "}
                <code className="font-mono">{`{ object: "list", data: [...] }`}</code>{" "}
                format.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <CardTitle>Standardized OpenAI Error Format</CardTitle>
            </div>
            <CardDescription>
              All authentication, routing, and provider errors return a clean
              JSON structure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md border bg-muted/30 p-4 font-mono text-xs overflow-x-auto">
              {JSON.stringify(
                {
                  error: {
                    message: "Invalid API key provided",
                    type: "authentication_error",
                    code: "invalid_api_key",
                  },
                },
                null,
                2
              )}
            </pre>
          </CardContent>
        </Card>
      </div>

      {/* Preview LLM Markdown Modal */}
      <ModalDialog
        open={llmModalOpen}
        onClose={() => setLlmModalOpen(false)}
        title="LLM Context Prompt (Markdown)"
        description="Copy and paste this prompt into Cursor, Windsurf, ChatGPT, Claude, or Antigravity so the AI knows how to call your gateway."
      >
        <div className="space-y-4">
          <pre className="max-h-96 overflow-y-auto rounded-md border bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed">
            {llmMarkdownPrompt}
          </pre>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLlmModalOpen(false)}>
              Close
            </Button>
            <Button onClick={handleCopyForLlm}>
              {copiedLlm ? (
                <>
                  <Check className="h-4 w-4 text-emerald-300" />
                  Copied!
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Copy for LLM
                </>
              )}
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
