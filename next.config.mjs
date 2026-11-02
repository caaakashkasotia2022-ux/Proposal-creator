/** @type {import('next').NextConfig} */
const nextConfig = {
  // These packages use Node APIs / native-ish code and must not be bundled.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs", "nodemailer", "google-auth-library"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
