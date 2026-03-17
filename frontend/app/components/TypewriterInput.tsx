"use client";

import { useState, useEffect, useRef } from "react";

const TOPICS = [
  "Искусственный интеллект в медицине",
  "История Второй мировой войны",
  "Характеристики планет Солнечной системы",
  "Глобальное потепление и его последствия",
  "Развитие интернета в России",
  "Квантовые вычисления: перспективы",
  "Пизанская башня — история и архитектура",
  "Экономика России в XXI веке",
  "Нейронные сети и машинное обучение",
  "История развития авиации",
];

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
};

export default function TypewriterInput({ value, onChange, disabled, className }: Props) {
  const [displayed, setDisplayed] = useState("");
  const stateRef = useRef({ topicIdx: 0, charIdx: 0, isDeleting: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function tick() {
      const s       = stateRef.current;
      const current = TOPICS[s.topicIdx];

      if (!s.isDeleting) {
        s.charIdx++;
        setDisplayed(current.slice(0, s.charIdx));
        if (s.charIdx === current.length) {
          timerRef.current = setTimeout(() => { s.isDeleting = true; tick(); }, 2200);
          return;
        }
        timerRef.current = setTimeout(tick, 85);
      } else {
        s.charIdx--;
        setDisplayed(current.slice(0, s.charIdx));
        if (s.charIdx === 0) {
          s.isDeleting = false;
          s.topicIdx   = (s.topicIdx + 1) % TOPICS.length;
          timerRef.current = setTimeout(tick, 400);
          return;
        }
        timerRef.current = setTimeout(tick, 38);
      }
    }

    timerRef.current = setTimeout(tick, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        className={className}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        required
        placeholder=""
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      {/* Анимированный плейсхолдер — курсор стоит вплотную к тексту */}
      {!value && (
        <div style={{
          position:      "absolute",
          top:           0,
          left:          0,
          width:         "100%",
          height:        "100%",
          padding:       "18px 22px",
          boxSizing:     "border-box",
          pointerEvents: "none",
          display:       "flex",
          alignItems:    "center",
          fontSize:      "1.05rem",
          fontFamily:    "'Inter', -apple-system, sans-serif",
          fontStyle:     "italic",
          color:         "#94A3B8",
          whiteSpace:    "nowrap",
          overflow:      "hidden",
        }}>
          <span>{displayed}</span>
          <span style={{
            display:        "inline-block",
            width:          "2px",
            height:         "1em",
            background:     "#A78BFA",
            marginLeft:     "2px",
            verticalAlign:  "text-bottom",
            flexShrink:     0,
            animation:      "twBlink 0.8s step-end infinite",
          }}/>
        </div>
      )}
      <style>{`
        @keyframes twBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
