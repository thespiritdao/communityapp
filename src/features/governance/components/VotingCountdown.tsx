import { useEffect, useState } from "react";

export default function VotingCountdown({ votingEnd }: { votingEnd: string | Date | undefined }) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!votingEnd) return;
    const end = new Date(votingEnd).getTime();
    const update = () => {
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft("Voting ended");
      } else {
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / (1000 * 60)) % 60);
        const s = Math.floor((diff / 1000) % 60);
        setTimeLeft(
          `${d > 0 ? `${d}d ` : ""}${h > 0 ? `${h}h ` : ""}${m > 0 ? `${m}m ` : ""}${s}s`
        );
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [votingEnd]);

  return (
    <div className="text-sm text-gray-500">
      {timeLeft}
    </div>
  );
} 