'use client';

const Controls = ({ onNext, onStop, onReport, isPartnered }) => {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-4 z-20">
      <button
        onClick={onStop}
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold p-4 rounded-full shadow-lg transition transform hover:scale-110"
      >
        Stop
      </button>
      <button
        onClick={onNext}
        className="bg-rose-500 hover:bg-rose-600 text-white font-bold p-6 rounded-full shadow-lg transition transform hover:scale-110"
      >
        Next
      </button>
      <button
        onClick={onReport}
        disabled={!isPartnered}
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold p-4 rounded-full shadow-lg transition transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Report
      </button>
    </div>
  );
};

export default Controls;
