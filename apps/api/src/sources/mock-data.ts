import type {
  AnimeDetail,
  AnimeSummary,
  EpisodeSummary,
  GenreDetail,
  Language,
} from '@animeunion/shared';

type AnimeType = AnimeDetail['type'];
type AnimeStatus = AnimeDetail['status'];
type Season = NonNullable<AnimeDetail['season']>;

const COVER_BASE = 'https://cdn.animeunion.tv/cover';
const BANNER_BASE = 'https://cdn.animeunion.tv/banner';
const THUMB_BASE = 'https://cdn.animeunion.tv/thumb';
const VIDEO_BASE = 'https://stream.animeunion.tv/hls';

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickRange(seed: string, min: number, max: number): number {
  return min + (fnv1a(seed) % (max - min + 1));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const GENRE_DEFS: ReadonlyArray<readonly [string, string, number]> = [
  ['Azione', 'Action', 1],
  ['Avventura', 'Adventure', 2],
  ['Commedia', 'Comedy', 4],
  ['Dramma', 'Drama', 8],
  ['Fantasy', 'Fantasy', 10],
  ['Horror', 'Horror', 14],
  ['Mistero', 'Mystery', 7],
  ['Romantico', 'Romance', 22],
  ['Fantascienza', 'Sci-Fi', 24],
  ['Slice of Life', 'Slice of Life', 36],
  ['Sport', 'Sports', 30],
  ['Soprannaturale', 'Supernatural', 37],
  ['Thriller', 'Thriller', 41],
  ['Psicologico', 'Psychological', 40],
  ['Mecha', 'Mecha', 18],
  ['Musica', 'Music', 19],
  ['Scolastico', 'School', 23],
  ['Seinen', 'Seinen', 42],
  ['Shonen', 'Shounen', 27],
  ['Shojo', 'Shoujo', 25],
  ['Isekai', 'Isekai', 62],
  ['Storico', 'Historical', 13],
  ['Militare', 'Military', 38],
  ['Demoni', 'Demons', 6],
  ['Magia', 'Magic', 16],
  ['Arti Marziali', 'Martial Arts', 17],
  ['Gioco', 'Game', 11],
  ['Gastronomia', 'Gourmet', 73],
];

export const genres: GenreDetail[] = GENRE_DEFS.map(([name, nameEng, malId], index) => ({
  id: `mock_genre_${index}`,
  slug: slugify(nameEng),
  name,
  nameEng,
  malId,
}));

type SeedRow = readonly [string, string | null, AnimeType, string, Season, number, AnimeStatus];

const ANIME_SEED: ReadonlyArray<SeedRow> = [
  ['Edens Zero', 'Edens Zero', 'TV', 'J.C.Staff', 'SPRING', 2021, 'COMPLETED'],
  ['Jujutsu Kaisen', 'Jujutsu Kaisen', 'TV', 'MAPPA', 'FALL', 2020, 'ONGOING'],
  ['Chainsaw Man', 'Chainsaw Man', 'TV', 'MAPPA', 'FALL', 2022, 'ONGOING'],
  ['Spy x Family', 'Spy x Family', 'TV', 'Wit Studio', 'SPRING', 2022, 'ONGOING'],
  ['Frieren', 'Frieren - Oltre la fine del viaggio', 'TV', 'Madhouse', 'FALL', 2023, 'COMPLETED'],
  ['Vinland Saga', 'Vinland Saga', 'TV', 'Wit Studio', 'SUMMER', 2019, 'COMPLETED'],
  ['Mob Psycho 100', 'Mob Psycho 100', 'TV', 'Bones', 'SUMMER', 2016, 'COMPLETED'],
  ['Dr. Stone', 'Dr. Stone', 'TV', 'TMS Entertainment', 'SUMMER', 2019, 'ONGOING'],
  ['Demon Slayer', 'Demon Slayer - Kimetsu no Yaiba', 'TV', 'ufotable', 'SPRING', 2019, 'ONGOING'],
  ['Attack on Titan', "L'attacco dei giganti", 'TV', 'Wit Studio', 'SPRING', 2013, 'COMPLETED'],
  ['Bocchi the Rock!', 'Bocchi the Rock!', 'TV', 'CloverWorks', 'FALL', 2022, 'COMPLETED'],
  ['Cyberpunk Edgerunners', 'Cyberpunk Edgerunners', 'ONA', 'Trigger', 'FALL', 2022, 'COMPLETED'],
  ['Made in Abyss', 'Made in Abyss', 'TV', 'Kinema Citrus', 'SUMMER', 2017, 'COMPLETED'],
  [
    'Re:Zero',
    'Re:Zero - Vivere di nuovo in un altro mondo',
    'TV',
    'White Fox',
    'SPRING',
    2016,
    'ONGOING',
  ],
  ['Steins;Gate', 'Steins;Gate', 'TV', 'White Fox', 'SPRING', 2011, 'COMPLETED'],
  ['Violet Evergarden', 'Violet Evergarden', 'TV', 'Kyoto Animation', 'SPRING', 2018, 'COMPLETED'],
  ['Hunter x Hunter', 'Hunter x Hunter', 'TV', 'Madhouse', 'FALL', 2011, 'COMPLETED'],
  ['One Punch Man', 'One Punch Man', 'TV', 'Madhouse', 'FALL', 2015, 'ONGOING'],
  ['Tokyo Revengers', 'Tokyo Revengers', 'TV', 'LIDENFILMS', 'SPRING', 2021, 'ONGOING'],
  ['Blue Lock', 'Blue Lock', 'TV', 'Eight Bit', 'FALL', 2022, 'ONGOING'],
  ['Horimiya', 'Horimiya', 'TV', 'CloverWorks', 'WINTER', 2021, 'COMPLETED'],
  [
    'Kaguya-sama: Love is War',
    'Kaguya-sama: Love is War',
    'TV',
    'A-1 Pictures',
    'WINTER',
    2019,
    'COMPLETED',
  ],
  ['Oshi no Ko', 'Oshi no Ko', 'TV', 'Doga Kobo', 'SPRING', 2023, 'ONGOING'],
  [
    'The Apothecary Diaries',
    'I diari della speziale',
    'TV',
    'Toho Animation',
    'FALL',
    2023,
    'ONGOING',
  ],
  ['Hells Paradise', 'Hell’s Paradise', 'TV', 'MAPPA', 'SPRING', 2023, 'ONGOING'],
  ['Solo Leveling', 'Solo Leveling', 'TV', 'A-1 Pictures', 'WINTER', 2024, 'ONGOING'],
  ['Mushoku Tensei', 'Mushoku Tensei', 'TV', 'Studio Bind', 'WINTER', 2021, 'ONGOING'],
  ['86 Eighty-Six', '86 Eighty-Six', 'TV', 'A-1 Pictures', 'SPRING', 2021, 'COMPLETED'],
  ['Ranking of Kings', 'Ranking of Kings', 'TV', 'Wit Studio', 'FALL', 2021, 'COMPLETED'],
  ['Sk8 the Infinity', 'Sk8 the Infinity', 'TV', 'Bones', 'WINTER', 2021, 'COMPLETED'],
  ['Odd Taxi', 'Odd Taxi', 'TV', 'OLM', 'SPRING', 2021, 'COMPLETED'],
  ['Ranma 1/2', 'Ranma ½', 'TV', 'MAPPA', 'FALL', 2024, 'ONGOING'],
  ['Dandadan', 'Dandadan', 'TV', 'Science SARU', 'FALL', 2024, 'ONGOING'],
  ['Kaiju No. 8', 'Kaiju No. 8', 'TV', 'Production I.G', 'SPRING', 2024, 'ONGOING'],
  ['Wind Breaker', 'Wind Breaker', 'TV', 'CloverWorks', 'SPRING', 2024, 'ONGOING'],
  ['Delicious in Dungeon', 'Delicious in Dungeon', 'TV', 'Trigger', 'WINTER', 2024, 'COMPLETED'],
  ['Bleach: TYBW', 'Bleach: Thousand-Year Blood War', 'TV', 'Pierrot', 'FALL', 2022, 'ONGOING'],
  ['Your Name', 'Your Name.', 'MOVIE', 'CoMix Wave Films', 'SUMMER', 2016, 'COMPLETED'],
  [
    'A Silent Voice',
    'La forma della voce',
    'MOVIE',
    'Kyoto Animation',
    'SUMMER',
    2016,
    'COMPLETED',
  ],
  ['Suzume', 'Suzume', 'MOVIE', 'CoMix Wave Films', 'FALL', 2022, 'COMPLETED'],
  ['Komi Can’t Communicate', 'Komi Can’t Communicate', 'TV', 'OLM', 'FALL', 2021, 'COMPLETED'],
  ['Lycoris Recoil', 'Lycoris Recoil', 'TV', 'A-1 Pictures', 'SUMMER', 2022, 'COMPLETED'],
  ['Akame ga Kill!', 'Akame ga Kill!', 'TV', 'White Fox', 'SUMMER', 2014, 'COMPLETED'],
  ['Black Clover', 'Black Clover', 'TV', 'Pierrot', 'FALL', 2017, 'COMPLETED'],
  ['Fire Force', 'Fire Force', 'TV', 'David Production', 'SUMMER', 2019, 'COMPLETED'],
  ['The Eminence in Shadow', 'The Eminence in Shadow', 'TV', 'Nexus', 'FALL', 2022, 'ONGOING'],
  ['Classroom of the Elite', 'Classroom of the Elite', 'TV', 'Lerche', 'SUMMER', 2017, 'ONGOING'],
  ['Tomodachi Game', 'Tomodachi Game', 'TV', 'Okuruto Noboru', 'SPRING', 2022, 'COMPLETED'],
  ['Sound! Euphonium', 'Sound! Euphonium', 'TV', 'Kyoto Animation', 'SPRING', 2015, 'ONGOING'],
  ['Zom 100', 'Zom 100: Bucket List of the Dead', 'TV', 'Bug Films', 'SUMMER', 2023, 'COMPLETED'],
];

function buildEpisodes(animeId: string, count: number, langs: Language[]): EpisodeSummary[] {
  const episodes: EpisodeSummary[] = [];
  for (let n = 1; n <= count; n++) {
    for (const language of langs) {
      const seed = `${animeId}-${n}-${language}`;
      episodes.push({
        id: `mock_ep_${animeId.replace('mock_anime_', '')}_${n}_${language}`,
        animeId,
        number: n,
        title: `Episode ${n}`,
        titleIta: `Episodio ${n}`,
        thumbnail: `${THUMB_BASE}/${animeId}/${n}.jpg`,
        duration: '24:00',
        airDate: null,
        isFiller: fnv1a(seed) % 11 === 0,
        language,
      });
    }
  }
  return episodes;
}

function buildAnime(row: SeedRow, index: number): AnimeDetail {
  const [title, titleIta, type, studio, season, year, status] = row;
  const id = `mock_anime_${index}`;
  const slug = slugify(title);
  const langs: Language[] = fnv1a(`lang-${id}`) % 3 === 0 ? ['SUB_ITA', 'DUB_ITA'] : ['SUB_ITA'];

  const genreCount = pickRange(`gcount-${id}`, 2, 4);
  const chosenGenres: GenreDetail[] = [];
  for (let g = 0; g < genreCount; g++) {
    const candidate = genres[fnv1a(`genre-${id}-${g}`) % genres.length];
    if (candidate && !chosenGenres.some((existing) => existing.id === candidate.id)) {
      chosenGenres.push(candidate);
    }
  }

  const episodeCount = type === 'MOVIE' ? 1 : pickRange(`epcount-${id}`, 12, 25);
  const episodes = buildEpisodes(id, episodeCount, langs);

  return {
    id,
    slug,
    title,
    titleIta,
    coverImage: `${COVER_BASE}/${slug}.jpg`,
    type,
    status,
    seasonYear: year,
    score: pickRange(`score-${id}`, 62, 92),
    genres: chosenGenres,
    availableLanguages: langs,
    titleEng: title,
    titleJpn: null,
    synopsis: `${titleIta ?? title}: sinossi di esempio generata per il catalogo mock di AnimeUnion.`,
    synopsisEng: `${title}: sample synopsis generated for the AnimeUnion mock catalog.`,
    bannerImage: `${BANNER_BASE}/${slug}.jpg`,
    trailerUrl: null,
    studio,
    episodeCount,
    episodeDuration: type === 'MOVIE' ? 110 : 24,
    malId: 1000 + index,
    anilistId: 2000 + index,
    season,
    relatedAnime: [],
    recommendations: [],
    episodes,
  };
}

export const animeDetails: AnimeDetail[] = ANIME_SEED.map(buildAnime);

for (const detail of animeDetails) {
  const others = animeDetails.filter((other) => other.id !== detail.id);
  const recs: AnimeSummary[] = [];
  for (let r = 0; r < 4; r++) {
    const candidate = others[fnv1a(`rec-${detail.id}-${r}`) % others.length];
    if (candidate && !recs.some((existing) => existing.id === candidate.id)) {
      recs.push(toSummary(candidate));
    }
  }
  detail.recommendations = recs;
}

export function toSummary(detail: AnimeDetail): AnimeSummary {
  return {
    id: detail.id,
    slug: detail.slug,
    title: detail.title,
    titleIta: detail.titleIta,
    coverImage: detail.coverImage,
    type: detail.type,
    status: detail.status,
    seasonYear: detail.seasonYear,
    score: detail.score,
    genres: detail.genres,
    availableLanguages: detail.availableLanguages,
  };
}

export function downloadUrlFor(episodeId: string): string {
  return `${VIDEO_BASE}/${episodeId}/index.m3u8`;
}
