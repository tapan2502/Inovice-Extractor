export const metadata = { title: "PDF Review Dashboard" };
import "./globals.css";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: 16 }}>{children}</div>
      </body>
    </html>
  );
}
