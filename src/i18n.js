import { computed, ref, watchEffect } from 'vue'

const dict = {
  pt: {
    titlePre: 'St', titleEm: 'iconify',
    tagline: 'Solte um SVG — ele volta rabiscado à mão livre.',
    stamp: 'Traço · Hachura · Ruído',
    theme: {dark: 'Modo escuro', light: 'Modo claro'},

    input: 'Entrada',
    repoLink: 'Ver o projeto no GitHub',
    dropTitle: 'Solte um SVG aqui',
    dropHint: 'ou clique para escolher',
    pasteToggle: 'ou colar o código SVG',
    remove: 'Remover',
    pasted: 'colado',
    iconify: 'Buscar no Iconify',
    iconifyHint: 'casa, seta, carrinho…',
    iconifyEmpty: 'Nenhum ícone com esse nome.',
    iconifyFail: 'Não deu para falar com o Iconify.',
    iconifyLink: 'Abrir iconify.design',

    board: 'Prancheta',
    emptyHint: 'Solte um SVG para começar',
    readFail: 'Não consegui ler',
    errorMeta: 'erro',
    shapes: (n, w, h) => `${n} forma${n > 1 ? 's' : ''} · viewBox ${w}×${h}`,

    recipes: 'Receitas',
    presets: {
      wireframe: 'Wireframe', hachure: 'Hachura clássica', thick: 'Rabisco grosso',
      charcoal: 'Carvão denso', dots: 'Pontilhista', ink: 'Nanquim limpo'
    },

    tune: 'Ajuste fino',
    roughness: 'Tremor do traço',
    bowing: 'Curvatura',
    strokeWidth: 'Espessura da caneta',
    fillStyle: 'Preenchimento',
    fill: {
      none: 'Vazado (só contorno)', hachure: 'Hachura', 'cross-hatch': 'Hachura cruzada',
      zigzag: 'Ziguezague', 'zigzag-line': 'Ziguezague em linha', dashed: 'Tracejado',
      dots: 'Pontilhado', solid: 'Chapado'
    },
    hachureGap: 'Espaço da hachura',
    hachureAngle: 'Ângulo da hachura',
    passes: 'Passadas do traço',
    pass: n => `${n} passada${n > 1 ? 's' : ''}`,
    dice: '↻ Sortear',
    diceTitle: 'Sortear novo desenho',
    inkColor: 'Cor da tinta',
    customColor: 'Cor personalizada',

    output: 'Saída',
    pngSize: 'Tamanho do PNG',
    bgTransparent: 'Fundo transparente',
    bgWhite: 'Fundo branco',
    bgDark: 'Fundo escuro',
    format: 'Formato do arquivo',
    formats: {
      svg: 'SVG', png: 'PNG', vue: 'Componente Vue', react: 'Componente React'
    },
    download: 'Baixar',
    downloadAll: n => `Baixar os ${n} (.zip)`,
    batch: (i, n) => `Gerando ${i}/${n}…`,
    suffix: '-rabiscado',
    zipName: 'rabiscos.zip',
    pngFail: 'Não deu para gerar o PNG: ',
    note: ['Ícones vazados (só linha) ficam melhores com preenchimento ', '. Ícones sólidos ganham vida com ', '.'],

    err: {
      noSvgTag: 'Nenhuma tag <svg> encontrada.',
      noShapes: 'Nenhuma forma desenhável encontrada.',
      pngEncode: 'Falha ao gerar o PNG.',
      pngLoad: 'Falha ao carregar o SVG.'
    }
  },

  en: {
    titlePre: 'St', titleEm: 'iconify',
    tagline: 'Drop an SVG — get it back redrawn freehand.',
    stamp: 'Stroke · Hatch · Noise',
    theme: {dark: 'Dark mode', light: 'Light mode'},

    input: 'Input',
    repoLink: 'View the project on GitHub',
    dropTitle: 'Drop an SVG here',
    dropHint: 'or click to pick',
    pasteToggle: 'or paste the SVG code',
    remove: 'Remove',
    pasted: 'pasted',
    iconify: 'Search Iconify',
    iconifyHint: 'home, arrow, cart…',
    iconifyEmpty: 'No icon by that name.',
    iconifyFail: "Couldn't reach Iconify.",
    iconifyLink: 'Open iconify.design',

    board: 'Drawing board',
    emptyHint: 'Drop an SVG to start',
    readFail: "Couldn't read",
    errorMeta: 'error',
    shapes: (n, w, h) => `${n} shape${n > 1 ? 's' : ''} · viewBox ${w}×${h}`,

    recipes: 'Recipes',
    presets: {
      wireframe: 'Wireframe', hachure: 'Classic hatch', thick: 'Thick scribble',
      charcoal: 'Dense charcoal', dots: 'Pointillist', ink: 'Clean ink'
    },

    tune: 'Fine tuning',
    roughness: 'Stroke shake',
    bowing: 'Bowing',
    strokeWidth: 'Pen width',
    fillStyle: 'Fill',
    fill: {
      none: 'Outline only', hachure: 'Hatch', 'cross-hatch': 'Cross-hatch',
      zigzag: 'Zigzag', 'zigzag-line': 'Zigzag line', dashed: 'Dashed',
      dots: 'Dots', solid: 'Solid'
    },
    hachureGap: 'Hatch gap',
    hachureAngle: 'Hatch angle',
    passes: 'Stroke passes',
    pass: n => `${n} pass${n > 1 ? 'es' : ''}`,
    dice: '↻ Shuffle',
    diceTitle: 'Roll a new drawing',
    inkColor: 'Ink color',
    customColor: 'Custom color',

    output: 'Output',
    pngSize: 'PNG size',
    bgTransparent: 'Transparent background',
    bgWhite: 'White background',
    bgDark: 'Dark background',
    format: 'File format',
    formats: {
      svg: 'SVG', png: 'PNG', vue: 'Vue component', react: 'React component'
    },
    download: 'Download',
    downloadAll: n => `Download all ${n} (.zip)`,
    batch: (i, n) => `Rendering ${i}/${n}…`,
    suffix: '-scribbled',
    zipName: 'scribbles.zip',
    pngFail: "Couldn't render the PNG: ",
    note: ['Outline icons (line only) look better with ', ' fill. Solid icons come alive with ', '.'],

    err: {
      noSvgTag: 'No <svg> tag found.',
      noShapes: 'No drawable shape found.',
      pngEncode: 'Failed to encode the PNG.',
      pngLoad: 'Failed to load the SVG.'
    }
  },

  nl: {
    titlePre: 'St', titleEm: 'iconify',
    tagline: 'Sleep een SVG — je krijgt hem met de hand overgetekend terug.',
    stamp: 'Lijn · Arcering · Ruis',
    theme: {dark: 'Donkere modus', light: 'Lichte modus'},

    input: 'Invoer',
    repoLink: 'Bekijk het project op GitHub',
    dropTitle: 'Sleep hier een SVG',
    dropHint: 'of klik om te kiezen',
    pasteToggle: 'of plak de SVG-code',
    remove: 'Verwijderen',
    pasted: 'geplakt',
    iconify: 'Zoek in Iconify',
    iconifyHint: 'huis, pijl, kar…',
    iconifyEmpty: 'Geen icoon met die naam.',
    iconifyFail: 'Iconify was niet bereikbaar.',
    iconifyLink: 'iconify.design openen',

    board: 'Tekenplank',
    emptyHint: 'Sleep een SVG hierheen om te beginnen',
    readFail: 'Kon niet lezen',
    errorMeta: 'fout',
    shapes: (n, w, h) => `${n} vorm${n > 1 ? 'en' : ''} · viewBox ${w}×${h}`,

    recipes: 'Recepten',
    presets: {
      wireframe: 'Wireframe', hachure: 'Klassieke arcering', thick: 'Dikke krabbel',
      charcoal: 'Dicht houtskool', dots: 'Pointillistisch', ink: 'Strakke inkt'
    },

    tune: 'Fijnafstelling',
    roughness: 'Lijntrilling',
    bowing: 'Kromming',
    strokeWidth: 'Pendikte',
    fillStyle: 'Vulling',
    fill: {
      none: 'Alleen omtrek', hachure: 'Arcering', 'cross-hatch': 'Kruisarcering',
      zigzag: 'Zigzag', 'zigzag-line': 'Zigzaglijn', dashed: 'Streepjes',
      dots: 'Stippen', solid: 'Effen'
    },
    hachureGap: 'Arceringsafstand',
    hachureAngle: 'Arceringshoek',
    passes: 'Aantal halen',
    pass: n => `${n} ha${n > 1 ? 'len' : 'al'}`,
    dice: '↻ Schudden',
    diceTitle: 'Nieuwe tekening loten',
    inkColor: 'Inktkleur',
    customColor: 'Eigen kleur',

    output: 'Uitvoer',
    pngSize: 'PNG-formaat',
    bgTransparent: 'Transparante achtergrond',
    bgWhite: 'Witte achtergrond',
    bgDark: 'Donkere achtergrond',
    format: 'Bestandsformaat',
    formats: {
      svg: 'SVG', png: 'PNG', vue: 'Vue-component', react: 'React-component'
    },
    download: 'Downloaden',
    downloadAll: n => `Alle ${n} downloaden (.zip)`,
    batch: (i, n) => `${i}/${n} renderen…`,
    suffix: '-gekrabbeld',
    zipName: 'krabbels.zip',
    pngFail: 'De PNG kon niet gemaakt worden: ',
    note: ['Omtrekiconen (alleen lijn) zien er beter uit met vulling ', '. Effen iconen komen tot leven met ', '.'],

    err: {
      noSvgTag: 'Geen <svg>-tag gevonden.',
      noShapes: 'Geen tekenbare vorm gevonden.',
      pngEncode: 'De PNG kon niet gecodeerd worden.',
      pngLoad: 'De SVG kon niet geladen worden.'
    }
  }
}

export const langs = Object.keys(dict)

const nav = navigator.language.slice(0, 2)
export const lang = ref(
  localStorage.getItem('lang') || (langs.includes(nav) ? nav : 'en')
)

export const t = computed(() => dict[lang.value])

export const errText = e => t.value.err[e.message] || e.message

watchEffect(() => {
  localStorage.setItem('lang', lang.value)
  document.documentElement.lang = lang.value === 'pt' ? 'pt-BR' : lang.value
})
