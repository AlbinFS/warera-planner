<script>
  /** An icon from an SVG path (Material Design Icons). Decorative unless `label` is given. */
  let { path, size = 18, color = 'currentColor', label = '' } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill={color} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
  {#if label}<title>{label}</title>{/if}
  <path d={path} />
</svg>

<style>
  svg { flex: none; vertical-align: middle; }
</style>
