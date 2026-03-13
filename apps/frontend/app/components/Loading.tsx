import React from "react";

export function Loading() {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050811] overflow-hidden">
            {/* Background elements */}
            <div className="absolute inset-0 pointer-events-none">
                <svg
                    className="w-full h-full object-cover"
                    viewBox="0 0 1920 1080"
                    preserveAspectRatio="xMidYMid slice"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <defs>
                        {/* Dimensional Sky Background */}
                        <radialGradient id="sky-grad" cx="50%" cy="100%" r="100%">
                            <stop offset="0%" stopColor="#2A4B5A" /> {/* Horizon haze */}
                            <stop offset="30%" stopColor="#1E3349" />
                            <stop offset="60%" stopColor="#0D182E" />
                            <stop offset="100%" stopColor="#040914" /> {/* Deep night sky */}
                        </radialGradient>

                        <radialGradient id="moon-glow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#e2f1ff" stopOpacity="1" />
                            <stop offset="30%" stopColor="#a3ccff" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#111c38" stopOpacity="0" />
                        </radialGradient>

                        {/* Multi-layered Lantern Glows for Realism */}
                        <radialGradient id="lantern-glow-core" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#FFF4D2" stopOpacity="1" />
                            <stop offset="20%" stopColor="#FFD166" stopOpacity="0.9" />
                            <stop offset="50%" stopColor="#FF9D00" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#FF6200" stopOpacity="0" />
                        </radialGradient>
                        
                        <radialGradient id="lantern-glow-outer" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#FFB84D" stopOpacity="0.6" />
                            <stop offset="50%" stopColor="#FF7B00" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#CC3300" stopOpacity="0" />
                        </radialGradient>

                        {/* Lantern Body Gradient (3D cylinder feel) */}
                        <radialGradient id="lantern-body-grad" cx="50%" cy="60%" r="60%" fx="50%" fy="70%">
                            <stop offset="0%" stopColor="#FFF2B2" />
                            <stop offset="25%" stopColor="#FFC837" />
                            <stop offset="70%" stopColor="#FF8008" />
                            <stop offset="100%" stopColor="#C43A00" />
                        </radialGradient>

                        <linearGradient id="lantern-rim-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5C3A21" />
                            <stop offset="50%" stopColor="#3D1B11" />
                            <stop offset="100%" stopColor="#1F0D07" />
                        </linearGradient>

                        <linearGradient id="tassel-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FF4D00" />
                            <stop offset="100%" stopColor="#8A1C00" />
                        </linearGradient>

                        {/* Distant Mountains with Atmospheric Perspective */}
                        <linearGradient id="mountain-back-1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1E334D" stopOpacity="0.6"/>
                            <stop offset="100%" stopColor="#081021" stopOpacity="0.9"/>
                        </linearGradient>

                        <linearGradient id="mountain-back-2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#14253A" stopOpacity="0.8"/>
                            <stop offset="100%" stopColor="#050A18" stopOpacity="1"/>
                        </linearGradient>

                        <linearGradient id="mountain-mid" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0D1A2E" />
                            <stop offset="100%" stopColor="#030712" />
                        </linearGradient>

                        {/* Illuminated City Gradients */}
                        <linearGradient id="city-buildings-front" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="#5A2E1D" /> {/* Warm lantern lit base */}
                            <stop offset="60%" stopColor="#2A1612" />
                            <stop offset="100%" stopColor="#110B0E" /> {/* Dark tops */}
                        </linearGradient>

                        <linearGradient id="city-buildings-back" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="#3D201A" />
                            <stop offset="100%" stopColor="#0D090B" />
                        </linearGradient>

                        {/* Water Depth */}
                        <linearGradient id="water-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#182A40" stopOpacity="0.95" />
                            <stop offset="40%" stopColor="#0A1424" stopOpacity="0.98" />
                            <stop offset="100%" stopColor="#02050A" stopOpacity="1" />
                        </linearGradient>

                        {/* Drop shadow for text and foreground elements */}
                        <filter id="glow-shadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="4" stdDeviation="12" floodColor="#FFB347" floodOpacity="0.3" />
                        </filter>

                        {/* Realistic Lantern Graphic */}
                        <g id="lantern">
                            {/* Outer Ambient Glow */}
                            <circle cx="0" cy="5" r="40" fill="url(#lantern-glow-outer)" />
                            
                            {/* Core Body */}
                            <path d="M -18, -22 Q 0, -38 18, -22 L 24, 14 Q 0, 32 -24, 14 Z" fill="url(#lantern-body-grad)" />
                            
                            {/* Dimensional Ribs / Wireframes */}
                            <path d="M -11, -25 Q 0, -32 11, -25 L 14, 16 Q 0, 26 -14, 16 Z" fill="none" stroke="#FFE28A" strokeWidth="1" opacity="0.5"/>
                            <path d="M 0, -28 L 0, 20" fill="none" stroke="#FFE28A" strokeWidth="1" opacity="0.6"/>
                            
                            {/* Specular Highlight */}
                            <path d="M -14, -18 Q 0, -26 14, -18" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity="0.4" filter="blur(1px)"/>

                            {/* Core Inner Glow */}
                            <circle cx="0" cy="0" r="12" fill="url(#lantern-glow-core)" />
                            
                            {/* Detailed Rims */}
                            <rect x="-13" y="16" width="26" height="5" rx="1" fill="url(#lantern-rim-grad)" />
                            <rect x="-14" y="15" width="28" height="2" fill="#5C3A21" /> {/* Rim highlight */}
                            
                            <rect x="-15" y="-26" width="30" height="5" rx="1" fill="url(#lantern-rim-grad)" />
                            <rect x="-15" y="-22" width="30" height="2" fill="#1F0D07" /> {/* Rim shadow */}
                            
                            {/* Detailed Tassel */}
                            <path d="M 0, 21 L 0, 30" stroke="#8A1C00" strokeWidth="2" />
                            <path d="M -3, 30 L -5, 45 M -1, 30 L -1, 48 M 1, 30 L 1, 48 M 3, 30 L 5, 45" stroke="url(#tassel-grad)" strokeWidth="1.5" strokeLinecap="round" />
                            {/* Tassel Knot */}
                            <circle cx="0" cy="30" r="2.5" fill="#FFC837" />
                        </g>

                        {/* Animations */}
                        <style>
                            {`
                                @keyframes float-up {
                                    0% { transform: translateY(110vh) scale(0.8) rotate(-3deg); opacity: 0; }
                                    10% { opacity: 1; }
                                    90% { opacity: 1; }
                                    100% { transform: translateY(-20vh) scale(1.15) rotate(3deg); opacity: 0; }
                                }
                                @keyframes float {
                                    0%, 100% { transform: translateY(0px); }
                                    50% { transform: translateY(-8px); }
                                }
                                @keyframes sway {
                                    0%, 100% { transform: translateX(0px) rotate(0deg); }
                                    50% { transform: translateX(15px) rotate(2deg); }
                                }
                                @keyframes pulse {
                                    0%, 100% { opacity: 0.85; transform: scale(1); filter: brightness(1) }
                                    50% { opacity: 1; transform: scale(1.02); filter: brightness(1.15) }
                                }
                                @keyframes star-twinkle {
                                    0%, 100% { opacity: 0.1; transform: scale(0.7); }
                                    50% { opacity: 0.9; transform: scale(1.3); }
                                }
                                @keyframes water-shift {
                                    0%, 100% { transform: translateX(-10px); }
                                    50% { transform: translateX(10px); }
                                }
                                
                                .lantern-obj { animation: pulse 4s infinite ease-in-out; }
                                .lantern-wrap { animation: float-up 10s infinite linear; }
                                
                                .p-1 { animation-duration: 22s; animation-delay: 0s; }
                                .p-2 { animation-duration: 26s; animation-delay: 3s; }
                                .p-3 { animation-duration: 32s; animation-delay: 7s; }
                                .p-4 { animation-duration: 28s; animation-delay: 2s; }
                                .p-5 { animation-duration: 35s; animation-delay: 11s; }
                                .p-6 { animation-duration: 24s; animation-delay: 5s; }
                                .p-7 { animation-duration: 29s; animation-delay: 9s; }
                                .p-8 { animation-duration: 38s; animation-delay: 4s; }
                                .p-9 { animation-duration: 33s; animation-delay: 8s; }
                                .p-10 { animation-duration: 25s; animation-delay: 12s; }
                                .p-11 { animation-duration: 30s; animation-delay: 15s; }
                                .p-12 { animation-duration: 36s; animation-delay: 1s; }
                                .p-13 { animation-duration: 27s; animation-delay: 14s; }
                                .p-14 { animation-duration: 31s; animation-delay: 10s; }
                                .p-15 { animation-duration: 29s; animation-delay: 18s; }

                                .star { animation: star-twinkle 5s infinite ease-in-out; }
                                .s-1 { animation-delay: 0s; }
                                .s-2 { animation-delay: 1.5s; }
                                .s-3 { animation-delay: 2.8s; }
                                .s-4 { animation-delay: 0.9s; }
                                .s-5 { animation-delay: 3.2s; }
                                
                                .water-anim { animation: water-shift 8s infinite ease-in-out; }
                            `}
                        </style>

                        {/* Architectural Gradients for Density */}
                        <linearGradient id="wood-front" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#542312" />
                            <stop offset="100%" stopColor="#2E1107" />
                        </linearGradient>
                        <linearGradient id="wood-side" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3A170A" />
                            <stop offset="100%" stopColor="#0F0401" />
                        </linearGradient>
                        <linearGradient id="roof-front" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#D9572B" />
                            <stop offset="100%" stopColor="#5E1B09" />
                        </linearGradient>
                        <linearGradient id="roof-side" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#752207" />
                            <stop offset="100%" stopColor="#210801" />
                        </linearGradient>
                        <radialGradient id="window-warm" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#FFF1B8" stopOpacity="1" />
                            <stop offset="70%" stopColor="#FF9D00" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#D14E00" stopOpacity="0.2" />
                        </radialGradient>

                        {/* Building Sub-Components */}
                        <g id="window-3d">
                            <rect x="0" y="0" width="16" height="24" fill="#140804" />
                            <rect x="2" y="2" width="12" height="20" fill="url(#window-warm)" filter="drop-shadow(0 0 4px #FF9D00)" />
                            <polygon points="7,2 9,2 9,22 7,22" fill="#3D1B11" />
                            <polygon points="2,10 14,10 14,12 2,12" fill="#3D1B11" />
                        </g>
                        <g id="window-side">
                            <polygon points="0,0 12,-6 12,18 0,24" fill="#0A0301" />
                            <polygon points="2,2 10,-2 10,16 2,20" fill="url(#window-warm)" opacity="0.7" />
                        </g>

                        <g id="building-a">
                            <polygon points="0,0 80,0 80,90 0,90" fill="url(#wood-front)" />
                            <polygon points="80,0 130,-25 130,65 80,90" fill="url(#wood-side)" />
                            <use href="#window-3d" x="15" y="40" />
                            <use href="#window-3d" x="45" y="40" />
                            <use href="#window-side" x="90" y="10" />
                            <use href="#window-side" x="110" y="0" />
                            <polygon points="-10,-10 90,-10 140,-35 40,-35" fill="#2E1107" />
                            <path d="M -15,-5 Q 40,15 95,-5 L 75,-40 Q 40,-30 5,-40 Z" fill="url(#roof-front)" />
                            <path d="M 95,-5 L 150,-30 L 130,-65 L 75,-40 Z" fill="url(#roof-side)" />
                        </g>

                        <g id="building-b">
                            <polygon points="0,100 150,100 150,220 0,220" fill="url(#wood-front)" />
                            <polygon points="150,100 230,60 230,180 150,220" fill="url(#wood-side)" />
                            <use href="#window-3d" x="20" y="150" />
                            <use href="#window-3d" x="65" y="150" />
                            <use href="#window-3d" x="110" y="150" />
                            <use href="#window-side" x="170" y="110" />
                            <use href="#window-side" x="200" y="95" />
                            <path d="M -25,100 Q 75,130 175,100 L 140,40 Q 75,50 10,40 Z" fill="url(#roof-front)" />
                            <path d="M 175,100 L 260,60 L 225,0 L 140,40 Z" fill="url(#roof-side)" />

                            <polygon points="20,-20 130,-20 130,80 20,80" fill="url(#wood-front)" />
                            <polygon points="130,-20 190,-50 190,50 130,80" fill="url(#wood-side)" />
                            <polygon points="10,80 140,80 140,90 10,90" fill="url(#wood-front)" />
                            <polygon points="140,80 200,50 200,60 140,90" fill="url(#wood-side)" />
                            <use href="#window-3d" x="40" y="30" />
                            <use href="#window-3d" x="80" y="30" />
                            <use href="#window-side" x="150" y="-5" />
                            <path d="M -5,-20 Q 75,0 155,-20 L 125,-75 Q 75,-60 25,-75 Z" fill="url(#roof-front)" />
                            <path d="M 155,-20 L 225,-55 L 195,-110 L 125,-75 Z" fill="url(#roof-side)" />
                        </g>

                        <g id="building-c">
                            <polygon points="0,0 200,0 200,60 0,60" fill="url(#wood-front)" />
                            <polygon points="200,0 260,-30 260,30 200,60" fill="url(#wood-side)" />
                            <use href="#window-3d" x="20" y="20" />
                            <use href="#window-3d" x="60" y="20" />
                            <use href="#window-3d" x="100" y="20" />
                            <use href="#window-3d" x="140" y="20" />
                            <path d="M -20,0 Q 100,20 220,0 L 180,-60 Q 100,-45 20,-60 Z" fill="url(#roof-front)" />
                            <path d="M 220,0 L 290,-35 L 250,-90 L 180,-60 Z" fill="url(#roof-side)" />
                        </g>

                        <g id="string-light">
                            <path d="M 0,0 Q 150,50 300,0" fill="none" stroke="#2E1107" strokeWidth="2" />
                            <circle cx="50" cy="20" r="3" fill="#FFE88A" filter="drop-shadow(0 0 4px #FF9D00)"/>
                            <circle cx="100" cy="35" r="3" fill="#FFE88A" filter="drop-shadow(0 0 4px #FF9D00)"/>
                            <circle cx="150" cy="40" r="4" fill="#FFB84D" filter="drop-shadow(0 0 6px #FF9D00)"/>
                            <circle cx="200" cy="35" r="3" fill="#FFE88A" filter="drop-shadow(0 0 4px #FF9D00)"/>
                            <circle cx="250" cy="20" r="3" fill="#FFE88A" filter="drop-shadow(0 0 4px #FF9D00)"/>
                        </g>
                    </defs>

                    {/* Sky */}
                    <rect width="100%" height="100%" fill="url(#sky-grad)" />

                    {/* Stars */}
                    <g fill="#ffffff">
                        <circle cx="200" cy="150" r="1.5" className="star s-1" />
                        <circle cx="500" cy="100" r="1" className="star s-2" />
                        <circle cx="800" cy="200" r="2" className="star s-3" />
                        <circle cx="1200" cy="80" r="1.5" className="star s-4" />
                        <circle cx="1600" cy="120" r="2" className="star s-5" />
                        <circle cx="1800" cy="250" r="1" className="star s-1" />
                        <circle cx="350" cy="300" r="1.5" className="star s-2" />
                        <circle cx="1000" cy="250" r="1.5" className="star s-3" />
                        <circle cx="1400" cy="350" r="1" className="star s-4" />
                        <circle cx="150" cy="400" r="1" className="star s-5" />
                        <circle cx="1700" cy="450" r="1.5" className="star s-1" />
                    </g>

                    {/* Layered Background Mountains for Depth */}
                    {/* Furthest */}
                    <path d="M0,1080 L0,650 Q200,550 400,680 T800,600 T1200,700 T1600,530 T1920,720 L1920,1080 Z" fill="url(#mountain-back-1)" />
                    {/* Mid-Far */}
                    <path d="M0,1080 L0,720 Q150,650 350,780 T750,700 T1150,800 T1550,660 T1920,800 L1920,1080 Z" fill="url(#mountain-back-2)" />
                    {/* Midground */}
                    <path d="M0,1080 L0,860 Q250,790 450,920 T950,830 T1350,960 T1750,840 L1920,950 L1920,1080 Z" fill="url(#mountain-mid)" />

                    {/* Central Atmosphere Scenery (Framing the edges, open center) */}
                    {/* Background Layer City (Smaller, darker) */}
                    <g transform="scale(0.85) translate(100, 150)" opacity="0.7">
                        <use href="#building-a" x="-100" y="850" />
                        <use href="#building-c" x="150" y="820" />
                        <use href="#building-b" x="500" y="750" />
                        
                        {/* Far right */}
                        <use href="#building-b" x="1800" y="700" />
                        <use href="#building-c" x="1500" y="810" />
                    </g>

                    {/* Midground Layer City (Side heavy) */}
                    <g transform="scale(0.95) translate(50, 40)" opacity="0.9">
                        <use href="#building-b" x="-50" y="720" />
                        <use href="#building-a" x="250" y="830" />
                        <use href="#building-c" x="450" y="880" />
                        
                        {/* Empty center: 600-1300 */}

                        <use href="#building-a" x="1400" y="860" />
                        <use href="#building-b" x="1650" y="720" />
                        <use href="#building-c" x="1850" y="880" />
                        
                        {/* Hanging bridge/string lights between buildings on edges */}
                        <use href="#string-light" x="100" y="780" transform="rotate(10 100 780)" />
                        <use href="#string-light" x="400" y="860" transform="rotate(-5 400 860)" />
                        
                        <use href="#string-light" x="1350" y="850" transform="rotate(-8 1350 850)" />
                        <use href="#string-light" x="1600" y="780" transform="rotate(12 1600 750)" />
                    </g>

                    {/* Hero Foreground Buildings & Docks (Pushed to sides) */}
                    <g>
                        {/* Left Massive structure */}
                        <use href="#building-b" x="0" y="680" transform="scale(1.2) translate(-20, -50)" />
                        <use href="#building-a" x="350" y="900" />
                        
                        {/* Right Massive structure */}
                        <use href="#building-b" x="1600" y="680" transform="scale(1.3) translate(50, -50)" />
                        <use href="#building-c" x="1400" y="900" />

                        {/* Low Foreground Docks framing the water in the center */}
                        <g fill="url(#wood-front)">
                            <polygon points="-50,960 250,1050 290,1030 -30,950" />
                            <polygon points="250,980 400,1080 440,1050 280,950" />
                            
                            <polygon points="1950,960 1650,1050 1610,1030 1930,950" />
                            <polygon points="1670,980 1520,1080 1480,1050 1640,950" />
                        </g>

                        {/* Foreground String Lights attached only to docks/buildings on sides */}
                        <use href="#string-light" x="-50" y="850" transform="rotate(5 -50 850)" />
                        <use href="#string-light" x="250" y="920" transform="scale(0.8) rotate(-15 250 920)" />
                        <use href="#string-light" x="1500" y="900" transform="rotate(10 1500 900)" />
                    </g>
                    
                    {/* Foreground Water with Depth */}
                    <path d="M 0,1000 Q 480,980 960,1000 T 1920,1000 L 1920,1080 L 0,1080 Z" fill="url(#water-grad)" />
                    
                    {/* Ripple/Wave accents */}
                    <path d="M 100,1020 Q 300,1010 500,1020 T 900,1020 T 1300,1020 T 1800,1020" fill="none" stroke="#2B4666" strokeWidth="2" opacity="0.3" className="water-anim"/>
                    <path d="M 200,1040 Q 400,1030 600,1040 T 1000,1040 T 1400,1040 T 1900,1040" fill="none" stroke="#2B4666" strokeWidth="1" opacity="0.2" className="water-anim" style={{ animationDelay: '-4s' }}/>

                    {/* Water Reflections from Harbor */}
                    <g transform="translate(660, 1000)" stroke="#FFB84D" strokeWidth="2.5" opacity="0.4" strokeLinecap="round" className="water-anim">
                        <line x1="120" y1="10" x2="160" y2="10" filter="url(#lantern-glow-core)" className="star s-2" />
                        <line x1="130" y1="20" x2="150" y2="20" className="star s-2" opacity="0.7" />
                        
                        <line x1="420" y1="5" x2="460" y2="5" filter="url(#lantern-glow-core)" className="star s-4" />
                        <line x1="415" y1="15" x2="465" y2="15" className="star s-4" opacity="0.6" />
                        <line x1="430" y1="25" x2="450" y2="25" className="star s-4" opacity="0.4" />
                    </g>
                </svg>
            </div>

            {/* Floating Lanterns Layer (Dimensional scale and varied opacity) */}
            <div className="absolute inset-0 pointer-events-none">
                <div style={{ left: "8%" }} className="absolute lantern-wrap p-1">
                    <div className="lantern-obj" style={{ transform: "scale(0.85)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "22%" }} className="absolute lantern-wrap p-2">
                    <div className="lantern-obj" style={{ transform: "scale(0.55)", filter: "blur(1px)", opacity: 0.8 }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "38%" }} className="absolute lantern-wrap p-3">
                    <div className="lantern-obj" style={{ transform: "scale(1.2)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "55%" }} className="absolute lantern-wrap p-4">
                    <div className="lantern-obj" style={{ transform: "scale(0.7)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "72%" }} className="absolute lantern-wrap p-5">
                    <div className="lantern-obj" style={{ transform: "scale(1.0)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "88%" }} className="absolute lantern-wrap p-6">
                    <div className="lantern-obj" style={{ transform: "scale(0.6)", filter: "blur(1.5px)", opacity: 0.7 }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "15%" }} className="absolute lantern-wrap p-7">
                    <div className="lantern-obj" style={{ transform: "scale(0.95)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "48%" }} className="absolute lantern-wrap p-8">
                    <div className="lantern-obj" style={{ transform: "scale(1.4)", filter: "drop-shadow(0 0 10px rgba(255, 150, 0, 0.4))" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "95%" }} className="absolute lantern-wrap p-9">
                    <div className="lantern-obj" style={{ transform: "scale(0.9)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "5%" }} className="absolute lantern-wrap p-10">
                    <div className="lantern-obj" style={{ transform: "scale(0.65)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "32%" }} className="absolute lantern-wrap p-11">
                    <div className="lantern-obj" style={{ transform: "scale(0.8)", filter: "blur(0.5px)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "68%" }} className="absolute lantern-wrap p-12">
                    <div className="lantern-obj" style={{ transform: "scale(1.1)" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "82%" }} className="absolute lantern-wrap p-13">
                    <div className="lantern-obj" style={{ transform: "scale(0.5)", filter: "blur(2px)", opacity: 0.6 }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "42%" }} className="absolute lantern-wrap p-14">
                    <div className="lantern-obj" style={{ transform: "scale(0.45)", filter: "blur(2px)", opacity: 0.5 }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
                <div style={{ left: "85%" }} className="absolute lantern-wrap p-15">
                    <div className="lantern-obj" style={{ transform: "scale(1.3)", filter: "drop-shadow(0 0 15px rgba(255, 180, 0, 0.3))" }}>
                        <svg width="100" height="130" viewBox="-50 -50 100 130"><use href="#lantern"/></svg>
                    </div>
                </div>
            </div>

            {/* Foreground Content */}
            <div className="relative z-10 flex flex-col items-center text-center mt-20">
                <div className="mb-10 relative flex items-center justify-center">
                    
                    {/* Deep Atmospheric Core Glow (wide and soft) - Reduced opacity for contrast */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[radial-gradient(circle,_rgba(255,184,77,0.15)_0%,_rgba(255,157,0,0.05)_40%,_transparent_70%)] animate-pulse mix-blend-screen pointer-events-none" style={{ animationDuration: '4s' }} />
                    
                    {/* Rotating Aura - kept subtle as a secondary effect */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 animate-spin mix-blend-screen pointer-events-none opacity-60" style={{ animationDuration: '12s' }}>
                        <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,_transparent_0%,_rgba(255,200,87,0.15)_25%,_transparent_50%,_rgba(255,157,0,0.1)_75%,_transparent_100%)] blur-[6px]" />
                    </div>

                    {/* Inner glow pushed back and softened to make the logo pop */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-[radial-gradient(circle,_rgba(255,226,138,0.2)_0%,_transparent_70%)] animate-pulse mix-blend-screen pointer-events-none" style={{ animationDuration: '2.5s' }} />

                    {/* Logo Image */}
                    <img 
                        src="/logo.png" 
                        alt="Cadence Logo" 
                        className="w-24 h-24 object-contain z-10 relative"
                        style={{ 
                            // Strong dark drop-shadows create contrast borders around the logo, separating it from the ambient light behind it
                            filter: "drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.6)) drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.8)) brightness(1.05) contrast(1.1)",
                            animation: "float 6s ease-in-out infinite" 
                        }}
                    />
                </div>
                
                <h2 className="text-[2rem] tracking-[0.3em] uppercase text-[#FFF4D2] font-display font-medium relative" style={{ textShadow: "0 0 24px rgba(255, 157, 0, 0.8), 0 4px 8px rgba(0,0,0,0.6)"}}>
                    Cadence
                </h2>
                <div className="mt-8 flex items-center justify-center gap-2.5 relative z-10">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFD166] animate-bounce shadow-[0_0_12px_rgba(255,157,0,1)]" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFD166] animate-bounce shadow-[0_0_12px_rgba(255,157,0,1)]" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFD166] animate-bounce shadow-[0_0_12px_rgba(255,157,0,1)]" style={{ animationDelay: "300ms" }}></span>
                </div>
            </div>
        </div>
    );
}
