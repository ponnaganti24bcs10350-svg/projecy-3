import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "NotebookLM — Chat with Your Documents",
  description:
    "Upload any PDF or text file and have an intelligent, grounded conversation with it. Powered by OpenAI and Qdrant vector search.",
  keywords: ["RAG", "AI", "document chat", "NotebookLM", "PDF chat"],
  openGraph: {
    title: "NotebookLM — Chat with Your Documents",
    description:
      "Upload any PDF or text file and have an intelligent, grounded conversation with it.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
