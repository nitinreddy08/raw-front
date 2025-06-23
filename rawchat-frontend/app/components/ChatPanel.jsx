'use client';

import { useState } from 'react';

const ChatPanel = ({ onSendMessage }) => {
  const [message, setMessage] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (message.trim()) {
      // This is a placeholder. In a real app, you'd send this via WebRTC data channel or Socket.IO
      console.log('Sending message:', message);
      setMessage('');
    }
  };

  return (
    <div className="w-full h-full bg-[#1a1a1a] rounded-lg p-4 flex flex-col">
      <div className="flex-grow mb-4 overflow-y-auto">
        <p className="text-gray-400 text-sm">Text chat is not yet implemented in this demo.</p>
      </div>
      <form onSubmit={handleSend} className="flex">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Text chat is disabled..."
          disabled
          className="flex-grow bg-[#2a2a2a] text-white rounded-l-lg p-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
        <button type="submit" disabled className="bg-rose-500 text-white font-bold p-2 rounded-r-lg cursor-not-allowed">
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
