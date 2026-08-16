import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 writes AGENTS.md/CLAUDE.md into the repo root on dev/build.
  // Skin Diary keeps its guidance in README.md instead.
  agentRules: false,
};

export default nextConfig;
