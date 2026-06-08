import {
  Bell,
  Box,
  Circle,
  Flame,
  Footprints,
  Gem,
  HeartPulse,
  Package,
  Shield,
  Sparkles,
  Star,
  Swords,
  WandSparkles,
  Wind,
  Zap
} from "lucide-react";
import type { ReactElement } from "react";
import type { SeIconId } from "../../shared/types.js";

interface Props {
  iconId: SeIconId | null;
}

export function SeIcon({ iconId }: Props): ReactElement | null {
  if (!iconId) return null;
  const size = 24;
  const strokeWidth = 1.45;
  const common = { size, strokeWidth };
  switch (iconId) {
    case "slash":
      return <Swords {...common} />;
    case "hit":
      return <Sparkles {...common} />;
    case "whoosh":
      return <Wind {...common} />;
    case "fire":
      return <Flame {...common} />;
    case "guard":
      return <Shield {...common} />;
    case "spark":
      return <Star {...common} />;
    case "wind":
      return <Wind {...common} />;
    case "rock":
      return <Gem {...common} />;
    case "magic":
      return <WandSparkles {...common} />;
    case "heal":
      return <HeartPulse {...common} />;
    case "shock":
      return <Zap {...common} />;
    case "step":
      return <Footprints {...common} />;
    case "item":
      return <Package {...common} />;
    case "alert":
      return <Bell {...common} />;
    case "generic":
      return <Box {...common} />;
    default:
      return <Circle {...common} />;
  }
}
