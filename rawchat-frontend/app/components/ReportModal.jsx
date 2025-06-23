'use client';

const ReportModal = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] p-6 rounded-lg shadow-xl text-center">
        <h2 className="text-xl font-bold mb-4">Report User?</h2>
        <p className="mb-6">Are you sure you want to report this user for inappropriate behavior?</p>
        <div className="flex justify-center gap-4">
          <button 
            onClick={onClose} 
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm} 
            className="bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 px-6 rounded-lg transition"
          >
            Confirm Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
