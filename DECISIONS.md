# Project decisions

Confirmed choices, so the code, website and viva answers stay consistent.

## Data
- Source: raw monthly plant exports in `Data/Raw/Winter/`, trimmed to 15 Oct 2025 – 14 Feb 2026 (123 days, 15-min blocks).
- Clean file: `Data/Clean/Winter_Clean.csv`, built by `src/build_clean_winter.py`. Nothing is dropped.
  - 27 Nov 2025, 07:45–16:30: copied data in the raw export → replaced with the average of 26 and 28 Nov at the same block.
  - 14 Jan 2026, 13:45–16:30: power stuck at 12.80 MW → re-estimated from GHI and module temperature (linear regression on the 7 days before, capped at the day's own peak).
  - Night GHI of 1.12 W/m² (one sensor step) → set to 0.
  - Wind direction kept as-is; output plateaus and cloudy-day swings left in.

## Forecasting setup
- Issue time: the forecast for day D+1 is made after day D ends, so all of day D is known. This is an assumption, stated as a limitation.
- Code layout: one self-contained Jupyter notebook per model in `src/` (e.g. `src/persistence_baseline.ipynb`); no shared Python modules.
- Learning models (MLR first, `src/mlr.ipynb`). These were my defaults when the user asked for the code; they can still be changed:
  - Row design: one row = one block b of day D+1; inputs are values at the same block b (day D for Cases 1–2, plus day D+1 weather for Case 3).
  - Trained and scored on daytime rows only (07:00–18:15); night forecasts are set to 0.
  - Wind direction used as recorded (no sine/cosine transform).
  - Fitted on the training split only; validation and test are only scored.
  - Forecasts clipped to [0, 21.5] MW.
- Ridge (`src/ridge.ipynb`): StandardScaler + Ridge in one pipeline, so scaling is learned from training data only. α is searched over 29 values from 0.01 to 100,000 (log-spaced) and chosen per case by the lowest validation RMSE; test is never used for the choice. Chosen α: Case 1 = 100, Case 2 ≈ 178, Case 3 = 0.01 (the lowest tried; validation RMSE is flat there, so Ridge ≈ MLR).
- Lasso and Elastic Net added to the lineup on 2026-10-24 at the user's request, completing the regularised linear family (L2, L1, both).
  - Lasso (`src/lasso.ipynb`): α over 21 values from 0.0001 to 10 (log-spaced), chosen per case by lowest validation RMSE. Chosen α: Case 1 ≈ 0.18, Case 2 = 0.01 (drops wind direction), Case 3 = 0.0001 (≈ MLR).
  - Elastic Net (`src/elastic_net.ipynb`): the same α grid × l1_ratio in {0.1, 0.3, 0.5, 0.7, 0.9}, chosen together by lowest validation RMSE. Chosen: Case 1 α ≈ 0.03 / r = 0.3; Case 2 α = 0.1 / r = 0.7 (drops wind speed and direction); Case 3 α = 0.0001 / r = 0.1 (≈ MLR).
- Random Forest (`src/random_forest.ipynb`): n_estimators = 300, random_state = 42. Grid: max_depth {3, 5, 8, 12, None} × min_samples_leaf {1, 5, 20, 50} × max_features {0.33, 0.67, 1.0} (Case 1 only 1.0, since it has one input); chosen per case by lowest validation RMSE. Chosen: Case 1 depth 5 / leaf 50; Case 2 depth 12 / leaf 1 / 0.33; Case 3 depth 12 / leaf 1 / 0.67. Also saves a depth sweep (1–20 and None) for the website slider and permutation importance on validation.
- AdaBoost (`src/adaboost.ipynb`): AdaBoostRegressor (AdaBoost.R2) with a DecisionTreeRegressor base, random_state = 42. Grid: base depth {3, 4, 5} × learning_rate {0.01, 0.05, 0.1, 0.5, 1.0} × loss {linear, square}, each fitted with 400 rounds; the number of rounds is chosen from the same fit with staged_predict. Everything chosen per case by lowest validation RMSE. Chosen: Case 1 depth 4 / lr 0.01 / square / 17 rounds; Case 2 depth 5 / lr 0.1 / square / 56 rounds; Case 3 depth 5 / lr 1.0 / linear / 17 rounds. Depth 5 (the top of the agreed 3–5 range) won for Cases 2–3. Saves per-round errors, average loss and vote weights, plus forecasts after selected rounds for the website slider. The full notebook takes about 11 minutes to run.
- Summary (`src/summary.ipynb`, run after every model notebook): re-scores every model × case × split from the saved forecasts with one shared function and exports the website data to `docs/data/` (the website will be served from `docs/` on GitHub Pages). All exported values are fractions of capacity. Ridge, Lasso and Elastic Net now also save training RMSE and coefficients for every α, for the penalty slider.
- 7-day average baseline: needs 7 full past days, so its first forecast day is 22 Oct (85 training days instead of 91). Validation and test are unaffected. Its skill score is computed against persistence on the same blocks.
- Split: done in each notebook's settings cell, chronological, by target day. Test = last 7 days; the rest is split about 80:20 into train and validation.

  | Split | Target days | Days |
  |---|---|---|
  | Train | 15 Oct 2025 – 14 Jan 2026 | 92 (91 usable: 15 Oct has no previous day) |
  | Validation | 15 Jan – 7 Feb 2026 | 24 |
  | Test | 8 – 14 Feb 2026 | 7 |

  Why the train/validation boundary is at 14 Jan: both repaired days (27 Nov, 14 Jan) fall in training, so every validation and test block is a real measurement.

## Website layout (user's choice, 2026-10-25)
- Top: final results, where models can be shown or hidden to see which performed best.
- Below: one section per model showing how it is built, in the style of the professor's step-by-step lecture companions.
- Separate pages: a results home page, plus one page per model linked from it.
- Model pages show no code. They explain the maths through interactive panels, like the professor's companions: "What you see / What to do / What to look for", live number tiles, equations, and a takeaway box.

## Website interactions (confirmed 2026-10-25)
- Day picker: actual power vs both baselines and each model (toggle on/off), shaded ±7% band, per-day MAE, RMSE, skill score and % inside the band.
- Comparison view: all models across the three cases and across days.
- Regularisation slider (Ridge / Lasso / Elastic Net): change α, see coefficients shrink (Lasso: drop to 0) and validation error change.
  - Replays the saved α search (nothing is trained in the browser); the α chosen on validation stays marked, and the reported model is always that one.
  - Shows validation error only; test results appear once, for the chosen α, in the results table.
  - At each α, inputs with β = 0 are shown as dropped (Lasso and Elastic Net; Ridge never drops any).
  - Elastic Net: l1_ratio fixed at its chosen value (or a small dropdown).
- Random Forest tree-depth slider: training vs validation error as depth grows (underfitting → overfitting).
- AdaBoost boosting-rounds slider: forecast and error after each round.
- All values shown as a fraction of capacity.
- Not included: preprocessing and evaluation-design interactions.
- Added 2026-10-25 (my suggestions, accepted by the user):
  - Day picker includes validation days (labelled) as well as test days, because the cloudy-day failures are in validation.
  - Regularisation slider shows training and validation error; test is revealed only after locking in α.
  - MAE vs RMSE toggle that re-ranks all models.
  - Random Forest step-through: every candidate split question for one tree, then grow it level by level (before the depth slider).
  - AdaBoost.R2 step-through on a small real subset (Next / Back / Play): weights, average loss, β, re-weighting, weighted-median vote.
  - "Try this" and "Predict, then check" prompts on every panel; footnote that every number matches the notebook outputs.

## Scoring
- Metrics are computed on daytime blocks only: a fixed window of 07:00–18:15 (blocks 29–74, 46 blocks per day).
  - Why: night power is always 0, so every model scores perfectly there; including night would roughly halve MAE/RMSE and inflate the ±7% band hit rate.
  - Why this window: across the whole winter, generation never starts before 07:00 or ends after 18:15. It is the same every day and does not depend on actual power.
- Models still output 0 for night blocks.
- Metrics: MAE and RMSE (MW and % of 21.5 MW), % of blocks within ±7% of capacity, and R² (%).
  - R² is a secondary metric: persistence already scores 88–97% because the daily solar curve dominates the variance, so models are compared mainly by nMAE and skill over persistence.

## Website build (2026-11-14)
- Static site in `docs/` (served by GitHub Pages from that folder): `index.html` (results home page) plus `models/baselines.html`, `mlr.html`, `regularisation.html`, `random-forest.html`, `adaboost.html`. Charts use Plotly.js 2.35.2 from jsDelivr.
- Uncertainty: 90% bootstrap intervals for every skill score (days resampled 1,000 times, seed 0), shown in the results table. Only Random Forest Case 3 has a test interval entirely above 0 (+19.6%, +3.5 to +38.6%).
- Home page also shows data plots (daily energy, average daily curve, power vs GHI, input correlations) exported to `docs/data/data.json`.
- Baselines page recomputes k-day averages (k = 1–7) in the browser from the validation/test actual curves; scored from 22 Jan so every k has full history.
- Random Forest page grows a depth-3 regression tree in the browser from the training rows (min 20 rows per side, no bootstrap) to show the split search.
- AdaBoost page replays scikit-learn's own AdaBoost.R2 on 20 training blocks (stumps, learning rate 1, linear loss); the sample is the first random_state on which boosting runs at least 6 rounds; the notebook asserts the average losses match scikit-learn's.
- Not committed to the public repo (`.gitignore`): `Data/` (instructor-provided plant data) and `results/` (contains actual power in MW). The site publishes power only as a fraction of capacity.

## Website simplified (2026-11-14, user's request) — replaces the layout and interaction lists above
- One clean, minimal page (`docs/index.html`) covering the guide's required sections: question, data, methods, evaluation, results, day explorer, errors & limitations, conclusion, reproduce. No per-model step-through pages (they were built, then removed at the user's request on 2026-11-14).
- Interactions kept: results table (case, validation/test, rank by RMSE, MAE or R²) and the day explorer (day, case, legend toggles).
- Ranking: only the six learning models are ranked. Persistence and the 7-day average are shown below as unranked reference rows. R² is ranked highest-first; RMSE and MAE lowest-first.
- 2026-11-14: Train / Validation / Test tabs on both the results table and the day explorer (`days.json` now holds all 122 scored days). Training-day scores are labelled as optimistic, since the models were fitted on them. Case buttons carry a short description of their inputs.
- 2026-11-14: Page additions for the rubric: author line (Dhanraj Visapara, 24110106), repo link placeholder, variables table, model rationale and assumptions, settings chosen on validation, scope-of-claim sentence, why not a random split or MAPE, AI-use note in the footer. New interactions: best/worst day buttons (in Results they jump to the day explorer; a day's difficulty is the learning models' average daily MAE for the chosen case and split), skill charts with 90% intervals (all cases for one split; one case across train/validation/test), and Random Forest input importance (Case 2 vs Case 3).
- 2026-11-14: GitHub repo `Dhanraj-24110106/solar-forecasting-es335` (public, needed for free GitHub Pages); site served from `main` → `/docs` at https://dhanraj-24110106.github.io/solar-forecasting-es335/. The empty `Regression.py` and the archived model pages were deleted.

## Website redesign (2026-11-15, user's request: "too much text, looks AI-made")
- Visual-first single page. Hero is a "sun calendar": the whole winter as a heatmap (days × 15-minute blocks) that doubles as the day picker.
- A sticky control bar holds two global switches (inputs case, data split) that drive every chart.
- Charts: one-day forecasts with model toggles, ranking dot plot (skill with 90% intervals; RMSE, MAE or R²), case 1→3 slope chart, train→validation→test slope chart, daily error map, power vs sunlight, Random Forest importance, split timeline.
- All rubric sections kept, text cut to short captions; details behind "More detail" toggles.
- Palette from dawn-to-noon light (indigo, rose, saffron, pale yellow on a cool salt-white); one typeface, Archivo, using its width axis.

## Three interactive experiments (2026-11-15, confirmed by the user)
Computed in `src/summary.ipynb` (section 6b) and exported to `docs/data/experiments.json`, except the tree, which is fitted in the browser. All reuse the settings already chosen on validation; nothing here tunes a model. The notebook asserts that the no-error and chronological numbers reproduce the main results.
- **Forecast error:** the Case 3 models are scored with tomorrow's sunlight multiplied by (1 + ε), ε ~ N(0, σ) drawn once per day, σ from 0 to 50%; module temperature's excess over air temperature is scaled the same way; skill is averaged over 30 draws. Break-even (skill = 0): Random Forest about 28% on validation and 15% on test; linear models about 19% and 5%. The error is simulated, not a real weather forecast.
- **Line against a tree:** a one-input regression tree (sunlight → power) grown best-first in the browser on 1,000 sampled training blocks and checked on 500 others, 1 to 60 leaves, against the least-squares line. Illustration only; errors are larger than the full models'.
- **Break the evaluation:** the same models scored with days shuffled and with blocks shuffled (5 seeds each, same split sizes). Case 2 Random Forest: −16.7% by date, +7.0% shuffled days, +11.5% shuffled blocks. Shown as a demonstration of leakage, never as a result; part of the by-date → shuffled-days jump is that shuffled test days come from the whole winter.

## "How the models learn" section (2026-11-15, confirmed by the user; on the main page)
Computed in `src/summary.ipynb` (section 6c) and exported to `docs/data/learning.json`; the penalty dial reuses `regularisation.json`. Settings are the ones already chosen on validation.
- **Gradient descent:** the Case 1 error surface (intercept, slope) is exact for all 4,186 training blocks, rebuilt from five averages of the data. Step size is a share of the largest stable step (2 ÷ steepest curvature). Raw input: the valley floor is about 11,500 times flatter than its walls, so descent needs tens of thousands of steps; standardised input: a round bowl, converges in a few steps. Both end at the least-squares line, 2.07 + 0.955 × today (in % of capacity; 0.446 MW + 0.955 × today).
- **Penalty dial:** coefficients, training and validation error for every α tried in tuning (Ridge, Lasso, Elastic Net at its chosen L1 share), per case.
- **Inputs kept or dropped (at the chosen settings):** Lasso drops wind direction in Case 2; Elastic Net drops wind speed and wind direction in Case 2; nothing is dropped in Cases 1 and 3; Ridge and MLR never drop inputs; tree models show permutation importance instead.
- **Bias and variance:** 50 bootstrap resamples of the training days, predictions on validation blocks; bias² = (mean forecast − actual)², variance = spread across resamples (bias² includes irreducible noise). Case 2: one tree 84.3 + 77.1; forest of 100 trees 82.7 + 3.1 (variance 96% lower, bias unchanged); MLR 89.8 + 1.2. Case 3: forest bias² 24 vs MLR 49.5.
- **Learning curve:** MLR and Random Forest trained on the most recent 7–91 training days. Random Forest validation nRMSE from 21 to 91 days: Case 2 9.23 → 9.07 (flat: limited by the inputs, not the amount of data); Case 3 5.26 → 4.85 (still improving slowly).
