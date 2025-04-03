<script lang="ts">
  import { onMount } from 'svelte';
  import type { ItemData } from '../types';

  export let data: ItemData[] = [];
  export let width = 800;
  export let height = 400;

  let canvas: HTMLCanvasElement;

  let previousData = [];

  let tooltipText = '';

  let tooltipVisible = false;

  let tooltipX = 0;

  let tooltipY = 0;

  let rect: DOMRect;

  // Minimize repaint
  $: if (canvas && data && data.length > 0) {
    if (!arraysEqual(previousData, data)) {
      console.log('Drawing chart with data points:', data.length);
      previousData = data;
      updateTooltip();
      drawChart();
    }
  }

  async function updateTooltip() {
    tooltipText = `Calculating...`;
    const value = await getAverage(data);
    tooltipText = `Average of the period: ${ value }`;
  }

  function arraysEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function drawChart() {
    const ctx = canvas.getContext('2d');
    if (!ctx || data.length === 0) return;

    // Reset all context settings
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;

    // Find minimum and maximum values
    const values = data.map((d) => d.value);
    const minValue = Math.floor(Math.min(...values));
    const maxValue = Math.ceil(Math.max(...values));

    console.log('Chart value range (vertical axis):', { minValue, maxValue });

    // Padding
    const padding = 50;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Scaling
    const scaleY = chartHeight / (maxValue - minValue);
    const scaleX = chartWidth / (data.length - 1);

    // Draw grid and labels
    ctx.strokeStyle = getCssVariable('--border-color');
    ctx.fillStyle = getCssVariable('--text-color-light');
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // Horizontal lines and value labels
    const steps = 10;

    for (let i = 0; i <= steps; i++) {
      const y = padding + (chartHeight * i) / steps;
      const value = maxValue - ((maxValue - minValue) * i) / steps;

      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      ctx.fillText(value.toFixed(1), padding - 5, y);
    }

    // Vertical lines and year labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i < data.length; i += Math.ceil(data.length / 10)) {
      const x = padding + i * scaleX;

      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();

      ctx.fillText(data[ i ].date, x, height - padding + 5);
    }

    // Draw the chart line
    ctx.beginPath();
    ctx.strokeStyle = getCssVariable('--primary-color');
    ctx.lineWidth = 2;

    data.forEach((point, i) => {
      const x = padding + i * scaleX;
      const y = height - padding - (point.value - minValue) * scaleY;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw data points
    ctx.fillStyle = getCssVariable('--primary-color');

    data.forEach((point, i) => {
      const x = padding + i * scaleX;
      const y = height - padding - (point.value - minValue) * scaleY;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Restore context state
    ctx.restore();
  }

  function getCssVariable(name: string): string {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  onMount(() => {
    console.log('Chart mounted');

    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.scale(dpr, dpr);
    }

  });

  function handleMouseMove(event: MouseEvent) {
    if (!rect) return;

    tooltipX = event.clientX - rect.left;
    tooltipY = event.clientY - rect.top;

    tooltipVisible = true;
  }

  function handleMouseLeave() {
    tooltipVisible = false;
  }

  function getCanvasRect() {
    rect = canvas.getBoundingClientRect();
  }

  async function getAverage(data: ItemData[], sliceBy = 50): Promise<string> {
    console.log(`Total items: ${ data.length }`);

    let totalSum = 0;
    let processedItems = 0;

    for (let i = 0; i < data.length; i += sliceBy) {
      const portion = data.slice(i, i + sliceBy);
      const portionSum = portion.reduce((sum, item) => sum + item.value, 0);

      totalSum += portionSum;
      processedItems += portion.length;

      console.log(`Processed ${ processedItems } items`);

      // Let the main thread breathe
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const average = totalSum / processedItems;

    console.log(`Final average: ${ average.toFixed(2) }`);

    return average.toFixed(2);
  }

</script>

<section style="position: relative;">
  <canvas
    bind:this={canvas}
    style="width: {width}px; height: {height}px;"
    on:mouseenter={getCanvasRect}
    on:mousemove={handleMouseMove}
    on:mouseleave={handleMouseLeave}
  />

  {#if tooltipVisible}
    <div class="tooltip" style="transform: translate({tooltipX}px, {tooltipY}px);">
      {tooltipText}
    </div>
  {/if}
</section>

<style>
  canvas {
    background: var(--background-white);
    border-radius: var(--border-radius);
  }

  .tooltip {
    position: absolute;
    left: 18px;
    top: 9px;
    background: var(--background-light-weight);;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 14px;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
