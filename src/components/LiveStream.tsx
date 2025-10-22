// src/components/LiveStream.tsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const LiveStream: React.FC = () => {
  const { match_id } = useParams<{ match_id: string }>();
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    // In a real application, you would fetch the roomUrl from your backend
    // based on the match_id. For this example, we'll use a placeholder.
    setRoomUrl(`https://duelverse.daily.co/duelverse_live_${match_id}`);
  }, [match_id]);

  const handleSendMessage = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && chatInput.trim()) {
      setChatMessages([...chatMessages, `💬 Você: ${chatInput.trim()}`]);
      setChatInput("");
    }
  };

  if (!roomUrl) {
    return <div>Loading...</div>;
  }

  return (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center">
      <iframe
        src={roomUrl}
        allow="camera; microphone; fullscreen; speaker; display-capture"
        style={{ width: "100%", height: "80vh", borderRadius: "12px" }}
      ></iframe>

      <div className="flex justify-between w-full p-2 bg-gray-900 text-white">
        <button onClick={() => window.history.back()}>Sair da Live</button>
        <span id="viewerCount">👀 Espectadores: 0</span>
      </div>

      <div className="w-full bg-gray-800 text-white p-3 mt-2 rounded-lg overflow-y-auto max-h-[200px]">
        {chatMessages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </div>
      <input
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={handleSendMessage}
        placeholder="Envie uma mensagem..."
        className="w-full p-2 mt-1 rounded-lg"
      />
    </div>
  );
};

export default LiveStream;
