-- =============================================================================
-- CEXindex — customer comment sentiment pipeline (v5, September 2026)
-- Run the whole file as ONE BigQuery script (temp tables + variables need it).
--
-- WHAT CHANGED vs v4 AND WHY
--
--  1. Longest match wins.  v4 counted "not clean" AND the bare "clean" from the
--     same three words, so one complaint scored a negative and a positive.
--     Every gram now carries its position, and a gram covered by a longer match
--     in the same clause is dropped.  Single biggest accuracy fix in here.
--  2. Negation is positional, not hand-listed.  A negator within 3 tokens before
--     a term (with no "and"/"or" in between) flips its sentiment.  So "wasn't
--     very friendly", "never fresh", "hardly worth it" all work without being
--     enumerated.  Contractions are expanded (n't -> not) before tokenising.
--  3. Intensity is positional too.  "very/really/so/absolutely X" is no longer a
--     separate lexicon entry — the intensifier adds +1 weight to X and downtoners
--     ("quite", "a bit") subtract 1.  That removed ~120 redundant v4 entries.
--  4. Ambiguous singles are back.  v4 had to strip "friendly", "fresh", "quick"
--     down to bigrams because of negation.  With 1 + 2 in place they are safe
--     again, and recall goes up a lot — most real comments say "staff were
--     lovely", not "really friendly barista".
--  5. One lexicon, one place.  v4 repeated ~600 terms across the sentiment CASE
--     and the sub_category CASE and they had drifted (e.g. 'no taste' was
--     negative but fell into 'uncategorised' until it was patched into drinks).
--     term -> sentiment -> sub_category -> weight is now declared once.
--  6. N-grams no longer cross punctuation.  Text is split into clauses on
--     . ! ? ; : , newline and on but/however/although/whereas first, so
--     "coffee was cold, service was great" can't produce the gram "cold
--     service", and a negation can't leak across the comma.
--  7. Smart apostrophes fixed.  Google Forms sends U+2019, which v4's
--     [[:alpha:]'] regex split into "wasn" + "t" — every 'wasn\'t ...' entry in
--     v4 was dead code that never matched a row.
--  8. Survey-level denominator.  Word rows now carry mention_surveys /
--     mention_comments as well as raw frequency, so "% of commenting customers
--     who mentioned X" is actually computable against survey_count_summary.
--  9. Two new outputs: comment_terms (one row per matched phrase — drill from a
--     word down to the comments behind it) and comment_sentiment_summary (net
--     score and label per comment, including mixed and unclassified).
--
-- SCHEMA COMPATIBILITY: word_cloud_summary keeps bakery_location, visit_date,
-- word, sentiment, sub_category, frequency with the same meanings, so the
-- get-word-cloud-data service keeps working untouched.  New columns are
-- additive.  `word` is the display form, so a negated hit renders as "not
-- friendly" rather than "friendly" coloured red.  One new sub_category value:
-- 'availability'.
-- =============================================================================

DECLARE max_gram INT64 DEFAULT 4;
DECLARE negation_window INT64 DEFAULT 3;   -- tokens to look back for a negator
DECLARE modifier_window INT64 DEFAULT 2;   -- tokens to look back for very/quite

-- Contractions are expanded before tokenising, so 'not' covers didn't/wasn't/etc.
DECLARE negators ARRAY<STRING> DEFAULT [
  'not', 'no', 'never', 'none', 'nothing', 'nobody', 'nor',
  'hardly', 'barely', 'scarcely', 'rarely', 'seldom',
  'without', 'lacking', 'lacked', 'lack', 'zero', 'stopped'
];

-- A negator must not reach past a coordinator: "not slow and rude" has to leave
-- "rude" negative.
DECLARE barriers ARRAY<STRING> DEFAULT [
  'and', 'or', 'plus', 'also', 'still', 'despite', 'except', 'apart'
];

DECLARE intensifiers ARRAY<STRING> DEFAULT [
  'very', 'really', 'so', 'super', 'extremely', 'incredibly', 'absolutely',
  'totally', 'completely', 'utterly', 'seriously', 'genuinely', 'particularly',
  'especially', 'always', 'consistently', 'exceptionally', 'unbelievably',
  'amazingly', 'such', 'too', 'well'
];

DECLARE downtoners ARRAY<STRING> DEFAULT [
  'quite', 'fairly', 'slightly', 'somewhat', 'bit', 'little', 'mildly',
  'reasonably', 'relatively', 'generally', 'usually', 'mostly', 'sometimes',
  'occasionally', 'perhaps', 'maybe'
];

-- Comments that carry no signal — excluded up front.
DECLARE null_comments ARRAY<STRING> DEFAULT [
  'n/a', 'na', 'n a', 'none', 'no', 'nope', 'nothing', 'nil', 'no comment',
  'no comments', 'nothing to add', 'nothing else', '-', '--', '.', '..', '...',
  'x', 'xx', 'no thanks', 'n/a.', 'none.'
];


-- =============================================================================
-- 1. LEXICON  —  term -> sentiment -> sub_category -> base weight
-- =============================================================================
-- Authoring rules:
--   * Lower case, no apostrophes, no punctuation (text is normalised the same
--     way before matching, so anything else can never match).
--   * Do NOT add "very X" / "really X" — the intensifier logic handles those.
--   * Do NOT add "not X" where X is already listed — negation handles it.  The
--     exceptions kept below are idioms whose negated sense is NOT the opposite
--     of the base ("not bad" is mild praise, not strong praise) or whose
--     sub_category differs ("no oat milk" is availability, not drinks).
--   * Weight is intensity, not confidence: 1 = mild, 2 = clear, 3 = strong.
--     Neutral topic mentions are weight 0 and never move a score.
--   * A longer phrase always beats a shorter one, so add the specific phrase
--     whenever the generic word categorises badly ("delicious" -> food, but
--     "delicious coffee" -> drinks).
-- =============================================================================

CREATE TEMP TABLE lexicon AS
WITH entries AS (

  -- ── POSITIVE ──────────────────────────────────────────────────────────────

  SELECT term, 'positive' AS sentiment, 'attitude' AS sub_category, 2 AS base_weight FROM UNNEST([
    'friendly', 'helpful', 'welcoming', 'polite', 'attentive', 'knowledgeable',
    'patient', 'professional', 'cheerful', 'smiling', 'chatty', 'courteous',
    'accommodating', 'engaging', 'kind', 'lovely staff', 'lovely team',
    'lovely barista', 'lovely people', 'nice people', 'great staff',
    'great team', 'amazing team', 'wonderful team', 'happy staff',
    'friendly staff', 'helpful staff', 'warm welcome', 'felt welcome',
    'feel welcome', 'made welcome', 'made me feel welcome',
    'good customer service', 'great customer service',
    'excellent customer service', 'looked after us', 'looked after me',
    'credit to the team', 'a credit to', 'well done', 'keep it up'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'attitude', 3 FROM UNNEST([
    'above and beyond', 'out of their way', 'nothing too much trouble',
    'made my day', 'remembers my name', 'remembered my name',
    'remembers my order', 'remembered my order', 'knows my order',
    'know my order', 'recognised me', 'recognised us'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'speed_of_service', 2 FROM UNNEST([
    'quick', 'fast', 'efficient', 'speedy', 'prompt', 'organised',
    'quick service', 'fast service', 'great service', 'good service',
    'excellent service', 'served quickly', 'served promptly', 'no queue',
    'no wait', 'no waiting', 'short wait', 'in and out', 'well run',
    'well organised', 'smooth', 'seamless'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'food', 2 FROM UNNEST([
    'fresh', 'tasty', 'delicious', 'moreish', 'yummy', 'freshly baked',
    'fresh pastry', 'fresh pastries', 'fresh bread', 'fresh sourdough',
    'fresh cake', 'fresh sandwich', 'lovely food', 'great food', 'good food',
    'amazing food', 'tasty food', 'great pastries', 'best croissant',
    'best pastries', 'best sourdough', 'still warm', 'warm from the oven',
    'piping hot', 'generous portion', 'good portion', 'perfectly baked',
    'melt in the mouth'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'drinks', 2 FROM UNNEST([
    'great coffee', 'good coffee', 'amazing coffee', 'best coffee',
    'lovely coffee', 'beautiful coffee', 'perfect coffee', 'excellent coffee',
    'delicious coffee', 'tasty coffee', 'fresh coffee', 'coffee was good',
    'coffee was lovely', 'coffee was great', 'coffee was perfect',
    'great latte', 'perfect latte', 'tasty latte', 'delicious latte',
    'great flat white', 'perfect flat white', 'best hot chocolate',
    'great hot chocolate', 'delicious hot chocolate', 'amazing drinks',
    'great drinks', 'perfectly made', 'well made', 'made perfectly',
    'best coffee in town'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'environment', 2 FROM UNNEST([
    'clean', 'spotless', 'immaculate', 'tidy', 'cosy', 'comfortable',
    'relaxing', 'clean tables', 'clean toilets', 'nice atmosphere',
    'great atmosphere', 'lovely atmosphere', 'good atmosphere', 'lovely space',
    'lovely spot', 'nice spot', 'well kept', 'well presented', 'looks great',
    'looks lovely', 'looks amazing', 'nice decor', 'lovely store',
    'beautiful store', 'plenty of seating', 'plenty of space'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'value', 2 FROM UNNEST([
    'affordable', 'reasonable', 'good value', 'great value', 'excellent value',
    'worth it', 'fair price', 'fair prices', 'good price', 'great price',
    'reasonably priced', 'well priced'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'value', 3 FROM UNNEST([
    'worth every penny'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'loyalty_app', 2 FROM UNNEST([
    'love the app', 'great app', 'app is great', 'app works well',
    'easy to use', 'free coffee', 'good rewards', 'great rewards'
  ]) AS term

  -- Overall praise, split by strength.
  UNION ALL SELECT term, 'positive', 'overall_sentiment', 3 FROM UNNEST([
    'amazing', 'awesome', 'excellent', 'fantastic', 'fabulous', 'brilliant',
    'outstanding', 'exceptional', 'perfect', 'superb', 'wonderful',
    'top notch', 'first class', 'faultless', 'impeccable', 'the best',
    'best bakery', 'best in town', 'hidden gem', 'not fault', 'no complaints',
    -- "cannot recommend enough" normalises to "can not recommend enough", so the
    -- entry must be the post-normalisation form.  It starts with the negator, so
    -- it is not flipped, and being longer it beats the flipped bare "recommend"
    -- ("would not recommend" still lands correctly as negative).
    'never disappoints', 'not recommend enough', 'highly recommend',
    'ten out of ten', 'five stars'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'overall_sentiment', 2 FROM UNNEST([
    'love', 'loved', 'lovely', 'great', 'fab', 'enjoyed', 'enjoy', 'enjoyable',
    'favourite', 'favorite', 'recommend', 'impressed', 'gem', 'treat',
    'consistently good', 'will be back', 'be back', 'come back again',
    'look forward', 'thank the team'
  ]) AS term

  UNION ALL SELECT term, 'positive', 'overall_sentiment', 1 FROM UNNEST([
    'good', 'nice', 'happy', 'pleased', 'satisfied', 'fine', 'decent',
    'not bad', 'no issues', 'no problems'
  ]) AS term

  -- ── NEGATIVE ──────────────────────────────────────────────────────────────

  UNION ALL SELECT term, 'negative', 'attitude', 2 FROM UNNEST([
    'rude', 'ignored', 'unhelpful', 'unwelcoming', 'miserable', 'inattentive',
    'dismissive', 'abrupt', 'blunt', 'curt', 'arrogant', 'patronising',
    'condescending', 'unprofessional', 'distracted', 'grumpy', 'moody',
    'rude staff', 'rude barista', 'miserable staff', 'ignored me', 'ignored us',
    'no eye contact', 'no greeting', 'no manners', 'bad manners',
    'no acknowledgement', 'no apology', 'never apologised', 'not acknowledge',
    'not apologise', 'not say thank you', 'looked miserable', 'seemed annoyed',
    'seemed angry', 'got angry', 'snapped at', 'rolled her eyes',
    'rolled his eyes', 'rolled their eyes', 'on their phone', 'on their phones',
    'chatting to each other', 'talking amongst themselves', 'felt unwelcome',
    'felt rushed', 'rushed me', 'rushed us', 'not care', 'could not care less',
    'needs training', 'no training', 'train your staff', 'staff unmotivated'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'attitude', 3 FROM UNNEST([
    'aggressive', 'shouted', 'shouted at', 'bad customer service',
    'poor customer service', 'terrible customer service',
    'awful customer service', 'no customer service'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'speed_of_service', 2 FROM UNNEST([
    'slow', 'chaotic', 'disorganised', 'unorganised', 'slow service',
    'slow barista', 'slow to be served', 'long wait', 'long queue', 'long time',
    'waited ages', 'waiting ages', 'ages to be served', 'still waiting',
    'took forever', 'forever to be served', 'queue out the door', 'huge queue',
    'massive queue', 'understaffed', 'under staffed', 'short staffed',
    'not enough staff', 'only one person serving', 'one member of staff',
    'arrived late', 'running late', 'opened late', 'held up'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'food', 2 FROM UNNEST([
    'stale', 'dry', 'soggy', 'burnt', 'undercooked', 'overbaked', 'over baked',
    'doughy', 'greasy', 'mouldy', 'stale bread', 'stale pastry',
    'stale croissant', 'stale cake', 'stale sandwich', 'dry cake', 'dry bread',
    'dry sandwich', 'dry pastry', 'rock hard', 'hard as a rock', 'day old',
    'tasteless food', 'bland food', 'too salty', 'too sweet', 'small portion',
    'tiny portion', 'stone cold', 'hair in my', 'hair in the'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'drinks', 2 FROM UNNEST([
    'lukewarm', 'luke warm', 'tasteless', 'bland', 'watery', 'bitter', 'weak',
    'undrinkable', 'no taste', 'bad coffee', 'poor coffee', 'awful coffee',
    'terrible coffee', 'worst coffee', 'cold coffee', 'coffee was cold',
    'coffee was burnt', 'burnt coffee', 'burnt milk', 'bitter coffee',
    'coffee bitter', 'weak coffee', 'coffee weak', 'cold latte', 'cold milk',
    'drink was cold', 'too milky', 'too much milk', 'not enough coffee',
    'wrong drink', 'wrong milk', 'wrong order', 'order wrong', 'spilled',
    'spilt', 'half full', 'no lid', 'leaked', 'takeaway cup', 'take away cup',
    'takeaway cups', 'take away cups', 'paper cup'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'environment', 2 FROM UNNEST([
    'dirty', 'messy', 'unclean', 'sticky', 'grubby', 'grimy', 'dusty',
    'uncomfortable', 'cramped', 'dull', 'dingy', 'crumbs', 'crumbs on floor',
    'food on floor', 'food on the floor', 'sticky tables', 'dirty tables',
    'dirty cups', 'dirty toilets', 'toilets dirty', 'dirty coffee machine',
    'tables not cleared', 'not cleared', 'not wiped', 'not regularly cleaned',
    'needs a clean', 'needs cleaning', 'bins overflowing', 'bin overflowing',
    'rubbish everywhere', 'bad smell', 'bad smells', 'smells bad', 'smelly',
    'too loud', 'too noisy', 'no atmosphere', 'cold inside', 'freezing',
    'chilly', 'tired looking', 'nowhere to sit', 'no seating', 'no tables free'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'environment', 3 FROM UNNEST([
    'filthy', 'unhygienic', 'flies', 'fly in', 'mould'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'value', 2 FROM UNNEST([
    'expensive', 'overpriced', 'pricey', 'poor value', 'not worth it',
    'prices have gone up', 'gone up in price', 'price increase',
    'used to be cheaper', 'overcharged', 'charged twice', 'wrong change'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'value', 3 FROM UNNEST([
    'rip off', 'ripoff', 'extortionate', 'daylight robbery', 'waste of money'
  ]) AS term

  -- NEW sub_category: availability / range.  v4 filed some of these under value
  -- ('no choice', 'no option') and missed the rest, but "sold out by 2pm" is an
  -- ops problem, not a pricing one.
  UNION ALL SELECT term, 'negative', 'availability', 2 FROM UNNEST([
    'sold out', 'ran out', 'run out', 'out of stock', 'nothing left',
    'empty shelves', 'no pastries', 'no pastries left', 'no croissants',
    'no sandwiches', 'no sourdough', 'no bread', 'not available', 'unavailable',
    'no choice', 'no option', 'limited choice', 'limited selection',
    'poor selection', 'no vegan option', 'no vegan', 'no gluten free',
    'no decaf', 'no oat milk', 'closed early', 'shut early', 'was closed'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'loyalty_app', 2 FROM UNNEST([
    'app not working', 'app does not work', 'app crashed', 'app is slow',
    'app is rubbish', 'not scan', 'would not scan', 'no stamp', 'missing stamp',
    'missing stamps', 'points missing', 'no points', 'no reward',
    'lost my points'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'overall_sentiment', 3 FROM UNNEST([
    'awful', 'terrible', 'horrible', 'horrendous', 'horrific', 'appalling',
    'atrocious', 'shocking', 'disgusting', 'disgrace', 'unacceptable',
    'nightmare', 'shambles', 'the worst', 'worst', 'never again',
    'not be back', 'not coming back', 'not going back', 'not return',
    'never returning', 'last time', 'avoid', 'stay away', 'gone downhill'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'overall_sentiment', 2 FROM UNNEST([
    'disappointing', 'disappointed', 'dissatisfied', 'let down', 'let me down',
    'let us down', 'poor', 'rubbish', 'bad', 'worse', 'chaos', 'joke',
    'embarrassing', 'upset', 'upsetting', 'annoying', 'irritating',
    'frustrating', 'frustrated', 'complained', 'complaint', 'refund',
    'could be better', 'could do better', 'used to be better', 'not as good',
    'not impressed', 'not happy'
  ]) AS term

  UNION ALL SELECT term, 'negative', 'overall_sentiment', 1 FROM UNNEST([
    'unfortunately', 'sadly', 'shame', 'awkward', 'meh'
  ]) AS term

  -- ── NEUTRAL TOPIC MENTIONS (weight 0 — volume only, never move a score) ────

  UNION ALL SELECT term, 'neutral', 'drinks', 0 FROM UNNEST([
    'coffee', 'latte', 'flat white', 'hot chocolate', 'dark hot chocolate',
    'iced latte', 'iced coffee', 'matcha latte', 'matcha', 'chai latte',
    'americano', 'cappuccino', 'tea', 'decaf', 'espresso', 'mocha',
    'filter coffee', 'cortado', 'macchiato', 'turmeric latte', 'babyccino',
    'hot drink', 'cold drink', 'iced drink', 'batch brew', 'milk', 'oat milk',
    'soya milk', 'almond milk', 'coconut milk', 'skimmed milk', 'whole milk',
    'syrup', 'extra shot'
  ]) AS term

  UNION ALL SELECT term, 'neutral', 'food', 0 FROM UNNEST([
    'pastry', 'pastries', 'croissant', 'croissants', 'sourdough', 'bread',
    'cake', 'sandwich', 'salad', 'brownie', 'cookie', 'cinnamon bun',
    'banana bread', 'toast', 'eggs', 'avocado', 'brunch', 'breakfast', 'lunch',
    'focaccia', 'quiche', 'soup', 'granola', 'porridge'
  ]) AS term

  UNION ALL SELECT term, 'neutral', 'operations', 0 FROM UNNEST([
    'cup', 'machine', 'coffee machine', 'till', 'grinder', 'laptops', 'staff',
    'team', 'barista', 'manager', 'server', 'queue', 'order', 'takeaway',
    'click and collect', 'delivery', 'opening hours', 'toilet', 'toilets',
    'seating', 'table', 'wifi', 'music', 'card payment'
  ]) AS term

  UNION ALL SELECT term, 'neutral', 'loyalty_app', 0 FROM UNNEST([
    'loyalty card', 'loyalty app', 'loyalty', 'app', 'reward', 'rewards',
    'points', 'scan', 'scanned', 'stamp', 'stamps', 'subscription'
  ]) AS term
)
SELECT
  term,
  sentiment,
  sub_category,
  base_weight,
  ARRAY_LENGTH(SPLIT(term, ' ')) AS n
FROM entries
WHERE TRUE
-- Guard: if a term ever gets listed twice, keep one row so the join below can't
-- silently double-count it.  Strongest, most specific definition wins.
QUALIFY ROW_NUMBER() OVER (PARTITION BY term ORDER BY base_weight DESC, sub_category) = 1;


-- =============================================================================
-- 2. NORMALISE COMMENTS
-- =============================================================================
-- Order matters: smart quotes -> contractions -> strip apostrophes -> common
-- elongations.  Note RE2 has no backreferences in patterns, so a generic
-- "squeeze repeated letters" rule is not available — the frequent elongations
-- are handled explicitly instead.
-- =============================================================================

CREATE TEMP TABLE comments AS
WITH src AS (
  SELECT
    GENERATE_UUID() AS comment_uid,
    survey_id,
    bakery_location,
    visit_date,
    feedback_comments
  FROM `cexindex.feedback_data.live_sheet_data`
  WHERE feedback_comments IS NOT NULL
    AND LENGTH(TRIM(feedback_comments)) > 2
    AND LOWER(TRIM(feedback_comments)) NOT IN UNNEST(null_comments)
),
straight AS (
  SELECT *,
    REGEXP_REPLACE(LOWER(feedback_comments), r'[\x{2018}\x{2019}\x{00B4}\x{0060}]', "'") AS t
  FROM src
),
expanded AS (
  -- "cannot" / "can't" / "cant" / "wasn't" / "didnt" -> "... not ..."
  SELECT * REPLACE (
    REGEXP_REPLACE(
      REGEXP_REPLACE(t, r'\bcannot\b', 'can not'),
      r"\b(ca|wo|do|does|did|is|was|were|are|has|have|had|could|would|should|must|ai|need)n'?t\b",
      r'\1 not'
    ) AS t)
  FROM straight
),
cleaned AS (
  SELECT * REPLACE (
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(REGEXP_REPLACE(t, r"'", ''), r'\bsoo+\b', 'so'),
          r'\bgo{2,}d\b', 'good'),
        r'\bgre+a+t\b', 'great'),
      r'\bama+zing\b', 'amazing'
    ) AS t)
  FROM expanded
)
SELECT comment_uid, survey_id, bakery_location, visit_date, feedback_comments,
       t AS norm_text
FROM cleaned;


-- =============================================================================
-- 3. SPLIT INTO CLAUSES AND TOKENISE
-- =============================================================================
-- Clause boundaries stop both n-grams and negation scope from crossing a change
-- of subject: "lovely staff, but the coffee was cold" is two independent
-- clauses and must never produce "staff cold" or negate "cold".
-- =============================================================================

CREATE TEMP TABLE comment_clauses AS
SELECT
  c.comment_uid,
  c.survey_id,
  c.bakery_location,
  c.visit_date,
  clause_idx,
  CONCAT(c.comment_uid, '#', CAST(clause_idx AS STRING)) AS clause_uid,
  REGEXP_EXTRACT_ALL(clause, r'[[:alpha:]]+') AS toks
FROM comments c,
UNNEST(REGEXP_EXTRACT_ALL(
  REGEXP_REPLACE(c.norm_text, r'\b(but|however|although|whereas)\b', '.'),
  r'[^.!?;:,\n]+'
)) AS clause WITH OFFSET clause_idx
WHERE ARRAY_LENGTH(REGEXP_EXTRACT_ALL(clause, r'[[:alpha:]]+')) > 0;


-- =============================================================================
-- 4. MATCH TERMS  ->  cexindex.feedback_data.comment_terms
-- =============================================================================
-- One row per surviving phrase match, carrying the comment it came from — this
-- is what powers "click a word, read the comments behind it".
-- =============================================================================

CREATE OR REPLACE TABLE `cexindex.feedback_data.comment_terms`
CLUSTER BY bakery_location, sentiment
AS
WITH grams AS (
  -- Every 1..max_gram-gram, keeping its position so overlaps can be resolved.
  SELECT
    c.clause_uid,
    n,
    start_pos,
    ARRAY_TO_STRING(ARRAY(
      SELECT tok FROM UNNEST(c.toks) AS tok WITH OFFSET o
      WHERE o >= start_pos AND o < start_pos + n
      ORDER BY o
    ), ' ') AS term
  FROM comment_clauses c
  CROSS JOIN UNNEST(GENERATE_ARRAY(1, max_gram)) AS n
  CROSS JOIN UNNEST(GENERATE_ARRAY(0, ARRAY_LENGTH(c.toks) - 1)) AS start_pos
  WHERE start_pos + n <= ARRAY_LENGTH(c.toks)
),
matched AS (
  SELECT g.clause_uid, g.start_pos, g.n, g.term,
         l.sentiment, l.sub_category, l.base_weight
  FROM grams g
  JOIN lexicon l ON l.term = g.term
),
resolved AS (
  -- Longest match wins: drop any hit whose span is fully covered by a longer
  -- hit in the same clause.  "not clean" kills "clean"; "bad customer service"
  -- kills both "bad" and "customer service".
  SELECT m.*
  FROM matched m
  LEFT JOIN matched cover
    ON  cover.clause_uid  = m.clause_uid
    AND cover.n           > m.n
    AND cover.start_pos  <= m.start_pos
    AND cover.start_pos + cover.n >= m.start_pos + m.n
  WHERE cover.clause_uid IS NULL
),
windowed AS (
  SELECT
    r.*,
    c.comment_uid, c.survey_id, c.bakery_location, c.visit_date,
    c.clause_idx, c.toks,
    -- position of the nearest negator in the look-back window (NULL if none)
    (SELECT MAX(o) FROM UNNEST(c.toks) AS tok WITH OFFSET o
      WHERE o < r.start_pos AND o >= r.start_pos - negation_window
        AND tok IN UNNEST(negators)) AS neg_pos,
    EXISTS(SELECT 1 FROM UNNEST(c.toks) AS tok WITH OFFSET o
           WHERE o < r.start_pos AND o >= r.start_pos - modifier_window
             AND tok IN UNNEST(intensifiers)) AS is_intensified,
    EXISTS(SELECT 1 FROM UNNEST(c.toks) AS tok WITH OFFSET o
           WHERE o < r.start_pos AND o >= r.start_pos - modifier_window
             AND tok IN UNNEST(downtoners)) AS is_downtoned
  FROM resolved r
  JOIN comment_clauses c USING (clause_uid)
),
scored AS (
  SELECT
    w.*,
    -- a negator only applies if no coordinator sits between it and the term
    w.neg_pos IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM UNNEST(w.toks) AS tok WITH OFFSET o
                     WHERE o > w.neg_pos AND o < w.start_pos
                       AND tok IN UNNEST(barriers)) AS is_negated
  FROM windowed w
),
weighted AS (
  SELECT *,
    CASE WHEN sentiment = 'neutral' THEN 0
         ELSE GREATEST(1, base_weight + IF(is_intensified, 1, 0) - IF(is_downtoned, 1, 0))
    END AS weight
  FROM scored
)
SELECT
  survey_id,
  bakery_location,
  visit_date,
  comment_uid,
  clause_uid,
  clause_idx,
  start_pos,
  n,
  term AS matched_term,
  -- display form: a flipped hit must not render as its positive base word
  IF(is_negated AND sentiment != 'neutral', CONCAT('not ', term), term) AS word,
  CASE
    WHEN sentiment = 'neutral'                    THEN 'neutral'
    WHEN is_negated AND sentiment = 'positive'    THEN 'negative'
    WHEN is_negated AND sentiment = 'negative'    THEN 'positive'
    ELSE sentiment
  END AS sentiment,
  sub_category,
  is_negated     AS negated,
  is_intensified AS intensified,
  is_downtoned   AS downtoned,
  weight,
  weight * CASE
    WHEN sentiment = 'neutral'                 THEN 0
    WHEN is_negated AND sentiment = 'positive' THEN -1
    WHEN is_negated AND sentiment = 'negative' THEN 1
    WHEN sentiment = 'positive'                THEN 1
    ELSE -1
  END AS signed_weight
FROM weighted;


-- =============================================================================
-- 5. WORD CLOUD SUMMARY  (schema-compatible superset of v4)
-- =============================================================================
-- ONE-TIME MIGRATION — run this by hand once, before the first v5 run:
--
--     DROP TABLE `cexindex.feedback_data.word_cloud_summary`;
--
-- The v4 table exists unclustered, and CREATE OR REPLACE cannot change a
-- clustering spec ("Cannot replace a table with a different partitioning
-- spec").  Once the table has been recreated WITH the clustering below, every
-- later run matches the existing spec and succeeds — this is a one-off, not a
-- recurring drop.
--
-- The DROP is deliberately NOT a statement in this script.  CREATE OR REPLACE
-- is atomic (readers keep seeing the old table until the new one is complete),
-- whereas an unconditional DROP in a scheduled job would leave the dashboard
-- endpoint with no table at all if any later statement failed.
-- =============================================================================

CREATE OR REPLACE TABLE `cexindex.feedback_data.word_cloud_summary`
CLUSTER BY bakery_location, sentiment
AS
SELECT
  bakery_location,
  visit_date,
  word,
  sentiment,
  sub_category,
  COUNT(*)                    AS frequency,         -- occurrences (as v4)
  COUNT(DISTINCT comment_uid) AS mention_comments,  -- comments mentioning it
  COUNT(DISTINCT survey_id)   AS mention_surveys,   -- denominator-safe count
  SUM(signed_weight)          AS sentiment_score,   -- intensity-weighted
  COUNTIF(negated)            AS negated_hits
FROM `cexindex.feedback_data.comment_terms`
GROUP BY 1, 2, 3, 4, 5;


-- =============================================================================
-- 6. COMMENT-LEVEL SENTIMENT  (new)
-- =============================================================================
-- Term counts alone cannot answer "what share of customers left a negative
-- comment" — one furious comment can contribute eight negative words.  This is
-- one row per comment, including the comments that matched nothing at all.
-- =============================================================================

CREATE OR REPLACE TABLE `cexindex.feedback_data.comment_sentiment_summary`
CLUSTER BY bakery_location
AS
WITH per_comment AS (
  SELECT
    comment_uid,
    SUM(signed_weight)              AS sentiment_score,
    COUNTIF(sentiment = 'positive') AS positive_terms,
    COUNTIF(sentiment = 'negative') AS negative_terms,
    COUNTIF(sentiment = 'neutral')  AS neutral_terms,
    ARRAY_AGG(IF(sub_category = 'overall_sentiment', NULL, sub_category)
              IGNORE NULLS ORDER BY ABS(signed_weight) DESC
              LIMIT 1)[SAFE_OFFSET(0)] AS top_sub_category,
    ARRAY_AGG(word ORDER BY ABS(signed_weight) DESC
              LIMIT 1)[SAFE_OFFSET(0)] AS top_term
  FROM `cexindex.feedback_data.comment_terms`
  GROUP BY comment_uid
)
SELECT
  c.survey_id,
  c.bakery_location,
  c.visit_date,
  c.comment_uid,
  c.feedback_comments,
  IFNULL(p.sentiment_score, 0) AS sentiment_score,
  IFNULL(p.positive_terms, 0)  AS positive_terms,
  IFNULL(p.negative_terms, 0)  AS negative_terms,
  IFNULL(p.neutral_terms, 0)   AS neutral_terms,
  p.top_sub_category,
  p.top_term,
  CASE
    WHEN p.comment_uid IS NULL THEN 'unclassified'
    WHEN p.positive_terms > 0 AND p.negative_terms > 0
         AND ABS(p.sentiment_score) <= 1 THEN 'mixed'
    WHEN p.sentiment_score > 0 THEN 'positive'
    WHEN p.sentiment_score < 0 THEN 'negative'
    WHEN p.positive_terms > 0 AND p.negative_terms > 0 THEN 'mixed'
    ELSE 'neutral'
  END AS sentiment_label
FROM comments c
LEFT JOIN per_comment p USING (comment_uid);


-- =============================================================================
-- 7. SURVEY COUNT SUMMARY
-- =============================================================================
-- total_surveys keeps its v4 meaning (surveys WITH a usable comment) so the
-- existing endpoint is unaffected; all_surveys is the full denominator next to
-- it for response-rate style measures.
-- =============================================================================

CREATE OR REPLACE TABLE `cexindex.feedback_data.survey_count_summary` AS
SELECT
  bakery_location,
  visit_date,
  COUNT(DISTINCT IF(feedback_comments IS NOT NULL
                    AND LENGTH(TRIM(feedback_comments)) > 2
                    AND LOWER(TRIM(feedback_comments)) NOT IN UNNEST(null_comments),
                    survey_id, NULL)) AS total_surveys,
  COUNT(DISTINCT survey_id)           AS all_surveys
FROM `cexindex.feedback_data.live_sheet_data`
WHERE survey_id IS NOT NULL
GROUP BY 1, 2;


-- =============================================================================
-- 8. TUNING QUERIES  (run ad hoc; not part of the build)
-- =============================================================================
--
-- 8a. What the lexicon is still missing.  Run monthly, skim the top 100, and
--     promote anything meaningful into section 1.  This feedback loop is what
--     grows coverage — guessing at terms is not.
--
-- WITH toks AS (
--   SELECT REGEXP_EXTRACT_ALL(LOWER(feedback_comments), r'[[:alpha:]]+') AS t
--   FROM `cexindex.feedback_data.live_sheet_data`
--   WHERE feedback_comments IS NOT NULL
-- ),
-- grams AS (
--   SELECT tok AS term FROM toks, UNNEST(t) AS tok
--   UNION ALL
--   SELECT ARRAY_TO_STRING([t[OFFSET(o)], t[OFFSET(o + 1)]], ' ')
--   FROM toks, UNNEST(GENERATE_ARRAY(0, ARRAY_LENGTH(t) - 2)) AS o
-- )
-- SELECT g.term, COUNT(*) AS n
-- FROM grams g
-- LEFT JOIN (SELECT DISTINCT matched_term FROM `cexindex.feedback_data.comment_terms`) ct
--        ON ct.matched_term = g.term
-- WHERE ct.matched_term IS NULL
--   AND g.term NOT IN ('the','a','and','of','to','was','is','it','i','in','for','my','me','they','we','this','that','with','had','have')
-- GROUP BY 1 HAVING n > 20 ORDER BY n DESC LIMIT 100;
--
-- 8b. Spot-check the negation flip — every row here should read as a genuine
--     reversal, not a false positive.  If something looks wrong, tighten
--     negation_window or add the phrase to the lexicon explicitly.
--
-- SELECT word, matched_term, sentiment, COUNT(*) AS n
-- FROM `cexindex.feedback_data.comment_terms`
-- WHERE negated GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 50;
--
-- 8c. Coverage: share of comments nothing matched.  If 'unclassified' climbs
--     above ~15% the lexicon is drifting behind how customers actually write.
--
-- SELECT sentiment_label, COUNT(*) AS comments,
--        ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
-- FROM `cexindex.feedback_data.comment_sentiment_summary`
-- GROUP BY 1 ORDER BY comments DESC;
-- =============================================================================
