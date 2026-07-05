import type { NextConfig } from "next";

const ignoredDevWatchPattern = /[/\\](?:\.cache|\.git|\.local|\.next|\.npm-cache|\.turbo|\.vercel|build|coverage|data|devspace|dist|logs|node_modules|output|outputs|playwright-report|profiles|test-results)(?:[/\\]|$)|[/\\]scripts[/\\]__pycache__(?:[/\\]|$)|[/\\]storage[/\\](?:video-batches|web-api-capture)(?:[/\\]|$)|\.(?:har|jsonl|log|mp4|mov|ndjson|tmp|trace|webm|zip)$/;

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ignoredDevWatchPattern
      };
    }

    return config;
  }
};

export default nextConfig;
