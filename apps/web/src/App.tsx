import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Dashboard } from "./components/Dashboard";

gsap.registerPlugin(ScrollTrigger);

gsap.defaults({
  duration: 0.5,
  ease: "power2.out",
});

export function App() {
  useEffect(() => {
    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return <Dashboard />;
}
