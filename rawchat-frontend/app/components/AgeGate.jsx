'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const AgeGate = () => {
  const router = useRouter();

  useEffect(() => {
    // Ensure deviceId exists
    if (!localStorage.getItem('deviceId')) {
      localStorage.setItem('deviceId', uuidv4());
    }
  }, []);

  const handleEnter = () => {
    // Set a session cookie for age verification
    document.cookie = 'ageVerified=true; path=/';
    router.push('/chat');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] p-8 rounded-lg shadow-2xl text-center max-w-md mx-4">
        <h1 className="text-3xl font-bold text-rose-500 mb-4">Welcome to RawChat</h1>
        <p className="text-lg mb-6">This is an 18+ random video chat site. By entering, you confirm you are 18 years of age or older and agree to our terms of service.</p>
        <button 
          onClick={handleEnter}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
        >
          Enter Site
        </button>
      </div>
    </div>
  );
};

export default AgeGate;
