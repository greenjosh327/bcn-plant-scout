import type { NextConfig } from "next";
import path from "path";

const supabaseImageHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "hjcskfmssgpdgrhhqzvk.supabase.co";
  } catch {
    return "hjcskfmssgpdgrhhqzvk.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseImageHost,
        pathname: "/storage/v1/object/public/product-images/**"
      }
    ]
  }
};

export default nextConfig;
