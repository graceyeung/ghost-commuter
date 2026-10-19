import type { Metadata } from "next";
import { ChatRoom } from "@/components/chat/ChatRoom";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6 sm:pt-8">
      <ChatRoom matchId={matchId} />
    </div>
  );
}
