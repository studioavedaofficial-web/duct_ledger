const colors = Object.fromEntries(
  [
    "background",
    "foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "border",
    "input",
    "ring",
    "nav-button",
    "hero-bg",
  ].map((key) => [key, "hsl(var(--" + key + "))"]),
);
module.exports = {
  content: ["./index.html", "./src/LandingScene.tsx"],
  theme: {
    extend: {
      colors,
      fontFamily: { sora: ["Sora", "sans-serif"] },
      keyframes: {
        "fade-up": {
          from: {
            opacity: 0,
            transform: "translateY(20px)",
            filter: "blur(4px)",
          },
          to: { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        },
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
      },
      animation: {
        "fade-up": "fade-up .7s cubic-bezier(.16,1,.3,1) both",
        "fade-in": "fade-in .5s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
