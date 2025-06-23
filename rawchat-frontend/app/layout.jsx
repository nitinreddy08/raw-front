import "./styles/globals.css";

export const metadata = {
  title: "RawChat - 18+ Random Video Chat",
  description:
    "Connect with people from around the world for anonymous video chat.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#111] text-white">{children}</body>
    </html>
  );
}
