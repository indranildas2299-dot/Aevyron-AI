import React from 'react';

interface MarqueeProps {
  text?: string;
  className?: string;
}

export const Marquee: React.FC<MarqueeProps> = ({
  text = 'Created by Indranil Officals · Aevyron AI · 100% Offline Local LLM + Wikipedia Media · English & বাংলা (Bengali) · Realme P4 5G Ready',
  className = '',
}) => {
  const repeatedItems = [0, 1, 2, 3];

  return (
    <div
      className={`overflow-hidden whitespace-nowrap select-none ${className}`}
      role="region"
      aria-label="Creator attribution marquee: Created by Indranil Officals"
    >
      <div className="animate-marquee items-center">
        {repeatedItems.map((idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-4 px-4 text-xs font-semibold tracking-wide text-teal-300"
          >
            <span>{text}</span>
            <span className="text-teal-500/60" aria-hidden="true">
              ✦
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};
