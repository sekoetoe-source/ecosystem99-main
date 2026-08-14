import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/logo-smpn99.png.asset.json";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3">
      <img
        src={logoAsset.url}
        alt="Logo SMP Negeri 99 Jakarta"
        className="size-10 object-contain"
        loading="eager"
      />
      <span className="leading-tight">
        <span className="block text-base font-extrabold tracking-tight">School Ecosystem</span>
        {!compact && (
          <span className="label-xs block text-muted-foreground">SMP Negeri 99 Jakarta</span>
        )}
      </span>
    </Link>
  );
}