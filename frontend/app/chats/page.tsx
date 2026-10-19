import type { Metadata } from "next";
import { ChatList } from "@/components/chat/ChatList";

export const metadata: Metadata = { title: "Chats" };

export default function ChatsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
      <ChatList />
    </div>
  );
}
