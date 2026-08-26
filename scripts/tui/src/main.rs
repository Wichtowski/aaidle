#![forbid(unsafe_code)]

use std::{
    env, fs, io,
    path::{Path, PathBuf},
    time::Duration,
};

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyModifiers},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{
    Terminal,
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Style},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

const DEFAULT_MODEL: &str = "gpt-5.6-luna";
const BATCH_SIZE: usize = 3;

#[derive(Debug, Error)]
enum AppError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

#[derive(Clone)]
struct SeedFile {
    path: PathBuf,
    entries: Vec<Value>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct Review {
    verdict: String,
    rationale: String,
    year_annotation: String,
    fix: Option<Value>,
    input_tokens: u64,
    output_tokens: u64,
    #[serde(default)]
    applied: bool,
}

#[derive(Deserialize)]
struct ApiReview {
    verdict: String,
    rationale: String,
    recommended_fix: Option<Value>,
    year_annotation: String,
}

#[derive(Deserialize, Default)]
struct ApiResponse {
    output: Vec<ApiOutput>,
    usage: Option<ApiUsage>,
}
#[derive(Deserialize, Default)]
struct ApiOutput {
    content: Vec<ApiContent>,
}
#[derive(Deserialize, Default)]
struct ApiContent {
    text: Option<String>,
}
#[derive(Deserialize, Default)]
struct ApiUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

#[derive(Default, Deserialize, Serialize)]
struct Cache {
    version: u32,
    reviews: std::collections::HashMap<String, Review>,
    total_cost: f64,
}

struct App {
    root: PathBuf,
    files: Vec<SeedFile>,
    file: usize,
    entry: usize,
    field: usize,
    reviews: std::collections::HashMap<(usize, usize, String), Review>,
    client: Client,
    model: String,
    message: String,
    running: bool,
    checkpoint: bool,
    entries_done: usize,
    next_file: usize,
    next_entry: usize,
    batch_cost: f64,
    total_cost: f64,
    input_price: f64,
    output_price: f64,
    spinner_frame: usize,
    approval_pending: bool,
    pending_fixes: Vec<(usize, usize, String)>,
    run_field: Option<String>,
}

impl App {
    fn new(root: PathBuf, files: Vec<SeedFile>) -> Result<Self, AppError> {
        let api_key = env::var("OPENAI_API_KEY")
            .map_err(|_| AppError::Message("OPENAI_API_KEY is not set".into()))?;
        if api_key.trim().is_empty() {
            return Err(AppError::Message("OPENAI_API_KEY is empty".into()));
        }
        let _ = api_key;
        let mut app = Self {
            root,
            files,
            file: 0,
            entry: 0,
            field: 0,
            reviews: Default::default(),
            client: Client::new(),
            model: env::var("OPENAI_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.into()),
            message: "Ready. c=check field, r=run all, a=apply, q=quit".into(),
            running: false,
            checkpoint: false,
            entries_done: 0,
            next_file: 0,
            next_entry: 0,
            batch_cost: 0.0,
            total_cost: 0.0,
            input_price: env::var("OPENAI_INPUT_USD_PER_MILLION")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1.25),
            output_price: env::var("OPENAI_OUTPUT_USD_PER_MILLION")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10.0),
            spinner_frame: 0,
            approval_pending: false,
            pending_fixes: Vec::new(),
            run_field: None,
        };
        app.load_cache()?;
        Ok(app)
    }

    fn cache_path(&self) -> PathBuf {
        self.root.join(".aaidle-seed-tui-cache.json")
    }

    fn cache_key(&self, file: usize, entry: usize, field: &str) -> String {
        format!("{}::{entry}::{field}", self.files[file].path.display())
    }

    fn load_cache(&mut self) -> Result<(), AppError> {
        let path = self.cache_path();
        if !path.exists() {
            return Ok(());
        }
        let cache: Cache = serde_json::from_str(&fs::read_to_string(path)?)?;
        self.total_cost = cache.total_cost;
        for (file, seed) in self.files.iter().enumerate() {
            for entry in 0..seed.entries.len() {
                let fields = seed.entries[entry]
                    .as_object()
                    .map(Map::keys)
                    .into_iter()
                    .flatten()
                    .cloned()
                    .collect::<Vec<_>>();
                for field in fields {
                    if let Some(review) = cache.reviews.get(&self.cache_key(file, entry, &field)) {
                        self.reviews.insert((file, entry, field), review.clone());
                    }
                }
            }
        }
        Ok(())
    }

    fn save_cache(&self) -> Result<(), AppError> {
        let reviews = self
            .reviews
            .iter()
            .map(|((file, entry, field), review)| {
                (self.cache_key(*file, *entry, field), review.clone())
            })
            .collect();
        let content = serde_json::to_string_pretty(&Cache {
            version: 1,
            reviews,
            total_cost: self.total_cost,
        })? + "\n";
        let path = self.cache_path();
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, content)?;
        let _: Value = serde_json::from_str(&fs::read_to_string(&tmp)?)?;
        fs::rename(tmp, path)?;
        Ok(())
    }

    fn current_fields(&self) -> Vec<String> {
        self.files
            .get(self.file)
            .and_then(|f| f.entries.get(self.entry))
            .and_then(Value::as_object)
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default()
    }

    fn current_key(&self) -> Option<(usize, usize, String)> {
        self.current_fields()
            .get(self.field)
            .cloned()
            .map(|f| (self.file, self.entry, f))
    }

    fn current_value(&self) -> Option<&Value> {
        let fields = self.current_fields();
        let key = fields.get(self.field)?.clone();
        self.files
            .get(self.file)?
            .entries
            .get(self.entry)?
            .as_object()?
            .get(&key)
    }

    fn select_next_entry(&mut self) {
        if self.entry + 1 < self.files[self.file].entries.len() {
            self.entry += 1;
        } else if self.file + 1 < self.files.len() {
            self.file += 1;
            self.entry = 0;
        } else {
            self.file = 0;
            self.entry = 0;
        }
        let field_count = self.current_fields().len();
        if field_count > 0 {
            self.field = self.field.min(field_count - 1);
        }
    }

    fn current_name(&self) -> String {
        self.files
            .get(self.file)
            .and_then(|f| f.entries.get(self.entry))
            .and_then(|entry| entry.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("(unnamed entry)")
            .to_owned()
    }

    async fn check_current(
        &mut self,
        terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    ) -> Result<(), AppError> {
        let (file, entry, field) = self
            .current_key()
            .ok_or_else(|| AppError::Message("No field selected".into()))?;
        if let Some(review) = self.reviews.get(&(file, entry, field.clone())).cloned() {
            self.message = format!("Loaded cached review for {field}: {}", review.verdict);
            self.pending_fixes
                .retain(|(f, e, name)| *f != file || *e != entry || name != &field);
            if !review.applied
                && (review.fix.is_some()
                    || (field == "releaseDate" && !review.year_annotation.trim().is_empty()))
            {
                self.pending_fixes.push((file, entry, field));
            }
            return Ok(());
        }
        let item = self.files[file].entries[entry].clone();
        let value = item.get(&field).cloned().unwrap_or(Value::Null);
        let client = self.client.clone();
        let model = self.model.clone();
        let field_for_request = field.clone();
        let request = check_field(&client, &model, &item, &field_for_request, &value);
        tokio::pin!(request);
        let spinner = ["|", "/", "-", "\\"];
        let review = loop {
            tokio::select! {
                result = &mut request => break result?,
                _ = tokio::time::sleep(Duration::from_millis(120)) => {
                    self.spinner_frame = (self.spinner_frame + 1) % spinner.len();
                    self.message = format!("Checking {field} {}", spinner[self.spinner_frame]);
                    draw(self, terminal).map_err(AppError::Io)?;
                }
            }
        };
        let cost = cost(&review, self.input_price, self.output_price);
        self.total_cost += cost;
        self.batch_cost += cost;
        self.message = format!("{}: {} | estimated ${cost:.5}", field, review.verdict);
        self.reviews
            .insert((file, entry, field.clone()), review.clone());
        self.pending_fixes
            .retain(|(f, e, name)| *f != file || *e != entry || name != &field);
        self.save_cache()?;
        if !review.applied
            && (review.fix.is_some()
                || (field == "releaseDate" && !review.year_annotation.trim().is_empty()))
        {
            self.pending_fixes.push((file, entry, field.clone()));
        }
        Ok(())
    }

    fn apply_current(&mut self) -> Result<(), AppError> {
        let (file, entry, field) = self
            .current_key()
            .ok_or_else(|| AppError::Message("No field selected".into()))?;
        let review = self
            .reviews
            .get(&(file, entry, field.clone()))
            .ok_or_else(|| AppError::Message("Check this field first".into()))?;
        let fix = review.fix.clone();
        let annotation = review.year_annotation.clone();
        if fix.is_none() && (field != "releaseDate" || annotation.trim().is_empty()) {
            self.message = "No recommended fix to apply".into();
            return Ok(());
        }
        let mut candidate = self.files[file].entries[entry].clone();
        let object = candidate
            .as_object_mut()
            .ok_or_else(|| AppError::Message("Entry is not a JSON object".into()))?;
        if let Some(fix) = fix {
            object.insert(field.clone(), fix);
        }
        if field == "releaseDate" && !annotation.trim().is_empty() {
            object.insert("yearAnnotation".into(), Value::String(annotation));
        }
        validate_entry(&candidate)?;
        let original_entries = self.files[file].entries.clone();
        self.files[file].entries[entry] = candidate;
        write_seed(&self.files[file].path, &self.files[file].entries)?;
        let written: Value = serde_json::from_str(&fs::read_to_string(&self.files[file].path)?)?;
        let written_entries = written
            .as_array()
            .ok_or_else(|| AppError::Message("Written seed root is not an array".into()))?;
        for (index, original) in original_entries.iter().enumerate() {
            if index != entry && written_entries.get(index) != Some(original) {
                return Err(AppError::Message(format!(
                    "Refusing apply: unrelated entry {index} changed"
                )));
            }
        }
        if let Some(review) = self.reviews.get_mut(&(file, entry, field.clone())) {
            review.applied = true;
        }
        self.pending_fixes
            .retain(|(f, e, name)| *f != file || *e != entry || name != &field);
        self.save_cache()?;
        self.message = format!(
            "Applied and validated fix only to entry {} / field {}",
            self.current_name(),
            field
        );
        Ok(())
    }

    async fn run_all(
        &mut self,
        terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    ) -> Result<(), AppError> {
        self.running = true;
        let mut fi = self.next_file;
        while fi < self.files.len() {
            let first_entry = if fi == self.next_file {
                self.next_entry
            } else {
                0
            };
            for ei in first_entry..self.files[fi].entries.len() {
                self.file = fi;
                self.entry = ei;
                let field_name = self
                    .run_field
                    .clone()
                    .ok_or_else(|| AppError::Message("No run field selected".into()))?;
                let fields = self.current_fields();
                let Some(field_index) = fields.iter().position(|name| name == &field_name) else {
                    continue;
                };
                self.field = field_index;
                self.check_current(terminal).await?;
                self.entries_done += 1;
                self.next_file = fi;
                self.next_entry = ei + 1;
                if self.next_entry >= self.files[fi].entries.len() {
                    self.next_file = fi + 1;
                    self.next_entry = 0;
                }
                if self.entries_done % BATCH_SIZE == 0
                    && self.entries_done < self.run_entries_total()
                {
                    self.running = false;
                    self.checkpoint = true;
                    self.approval_pending = true;
                    self.message = format!(
                        "Checkpoint after {} entries: batch ${:.5}, total ${:.5}. y=accept fixes, n=decline, Enter=continue, q=stop",
                        self.entries_done, self.batch_cost, self.total_cost
                    );
                    return Ok(());
                }
            }
            fi += 1;
        }
        if !self.pending_fixes.is_empty() {
            self.running = false;
            self.checkpoint = true;
            self.approval_pending = true;
            self.message = format!(
                "Finished all entries: ${:.5} total. y=accept fixes, n=decline, q=stop",
                self.total_cost
            );
            return Ok(());
        }
        self.running = false;
        self.message = format!(
            "Finished all entries. Total estimated cost ${:.5}",
            self.total_cost
        );
        Ok(())
    }

    fn apply_pending(&mut self) -> Result<(), AppError> {
        let pending = self.pending_fixes.clone();
        for (file, entry, field) in pending {
            self.file = file;
            self.entry = entry;
            self.field = self
                .current_fields()
                .iter()
                .position(|name| name == &field)
                .unwrap_or(0);
            self.apply_current()?;
        }
        self.pending_fixes.clear();
        self.message = "Accepted and applied batch fixes; JSON validated".into();
        Ok(())
    }

    fn total_entries(&self) -> usize {
        self.files.iter().map(|f| f.entries.len()).sum()
    }

    fn run_entries_total(&self) -> usize {
        let Some(field) = &self.run_field else {
            return 0;
        };
        self.files
            .iter()
            .flat_map(|file| &file.entries)
            .filter(|entry| entry.get(field).is_some())
            .count()
    }
    fn total_fields(&self) -> usize {
        self.files
            .iter()
            .flat_map(|f| &f.entries)
            .filter_map(Value::as_object)
            .map(Map::len)
            .sum()
    }
    fn reviewed_fields(&self) -> usize {
        self.reviews.len()
    }
    fn estimate_all(&self) -> f64 {
        if self.reviewed_fields() == 0 {
            0.0
        } else {
            self.total_cost / self.reviewed_fields() as f64 * self.total_fields() as f64
        }
    }
}

async fn check_field(
    client: &Client,
    model: &str,
    item: &Value,
    field: &str,
    value: &Value,
) -> Result<Review, AppError> {
    let prompt = format!(
        "You are a meticulous fact checker for a game seed catalog. Check factual correctness of the given field using your knowledge. Consider dates, names, creators, capabilities, modalities, categories, and consistency with the rest of the entry. Return JSON only with verdict (one of correct, questionable, incorrect), rationale (short), year_annotation (a short, independently reasoned factual note explaining why the releaseDate is supported; do not merely repeat, paraphrase, or infer it from the supplied seed text; use an empty string for non-releaseDate fields), and recommended_fix (the replacement JSON value, or null if no fix is needed). For releaseDate, recommended_fix MUST be either a four-digit year (YYYY) when only the year is independently supportable, or an exact real calendar date in YYYY-MM-DD format; never return unknown, approximate text, or another format. Do not treat the user-provided seed text as evidence by itself. Do not invent certainty; questionable is appropriate when verification is unavailable.\n\nFull entry:\n{}\n\nField to check: {field}\nCurrent value: {}",
        serde_json::to_string_pretty(item)?,
        serde_json::to_string(value)?
    );
    let body = serde_json::json!({"model": model, "reasoning": {"effort": "medium"}, "input": prompt, "text": {"format": {"type": "json_object"}}});
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(
            env::var("OPENAI_API_KEY")
                .map_err(|_| AppError::Message("OPENAI_API_KEY is not set".into()))?,
        )
        .json(&body)
        .send()
        .await?;
    let status = response.status();
    let response_body = response.text().await?;
    if !status.is_success() {
        let detail = serde_json::from_str::<Value>(&response_body)
            .ok()
            .and_then(|body| body.get("error").cloned())
            .map(|error| error.to_string())
            .unwrap_or(response_body);
        return Err(AppError::Message(format!(
            "OpenAI response ({status}): {detail}"
        )));
    }
    let raw: ApiResponse = serde_json::from_str(&response_body)
        .map_err(|e| AppError::Message(format!("Invalid OpenAI response ({status}): {e}")))?;
    let text = raw
        .output
        .into_iter()
        .flat_map(|o| o.content)
        .find_map(|c| c.text)
        .ok_or_else(|| AppError::Message("OpenAI returned no text".into()))?;
    let parsed: ApiReview = serde_json::from_str(&text).map_err(|e| {
        AppError::Message(format!("Invalid structured review: {e}; response: {text}"))
    })?;
    Ok(Review {
        verdict: parsed.verdict,
        rationale: parsed.rationale,
        year_annotation: parsed.year_annotation,
        fix: parsed.recommended_fix,
        input_tokens: raw.usage.as_ref().and_then(|u| u.input_tokens).unwrap_or(0),
        applied: false,
        output_tokens: raw
            .usage
            .as_ref()
            .and_then(|u| u.output_tokens)
            .unwrap_or(0),
    })
}

fn cost(review: &Review, input: f64, output: f64) -> f64 {
    review.input_tokens as f64 / 1_000_000.0 * input
        + review.output_tokens as f64 / 1_000_000.0 * output
}
fn validate_entry(value: &Value) -> Result<(), AppError> {
    if !value.is_object() {
        return Err(AppError::Message(
            "Seed entry must remain a JSON object".into(),
        ));
    }
    if let Some(date) = value.get("releaseDate") {
        let valid = date.as_str().is_some_and(is_exact_date);
        if !valid {
            return Err(AppError::Message(
                "releaseDate must be YYYY or an exact YYYY-MM-DD calendar date".into(),
            ));
        }
    }
    serde_json::to_string(value)?;
    Ok(())
}

fn is_exact_date(value: &str) -> bool {
    if value.len() == 4 {
        return value != "0000" && value.as_bytes().iter().all(u8::is_ascii_digit);
    }
    let parts: Vec<_> = value.split("-").collect();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return false;
    }
    let year = parts[0].parse::<i32>().ok();
    let month = parts[1].parse::<u32>().ok();
    let day = parts[2].parse::<u32>().ok();
    match (year, month, day) {
        (Some(year), Some(month), Some(day))
            if year >= 1 && (1..=12).contains(&month) && day >= 1 =>
        {
            let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
            let max_day = [
                31,
                if leap { 29 } else { 28 },
                31,
                30,
                31,
                30,
                31,
                31,
                30,
                31,
                30,
                31,
            ][(month - 1) as usize];
            day <= max_day
        }
        _ => false,
    }
}
fn write_seed(path: &Path, entries: &[Value]) -> Result<(), AppError> {
    let content = serde_json::to_string_pretty(entries)? + "\n";
    let tmp = path.with_extension("seed.json.tmp");
    fs::write(&tmp, &content)?;
    let check: Value = serde_json::from_str(&fs::read_to_string(&tmp)?)?;
    if !check.is_array() {
        return Err(AppError::Message(
            "Refusing to replace seed: root is not an array".into(),
        ));
    }
    fs::rename(tmp, path)?;
    Ok(())
}

fn discover(root: &Path) -> Result<Vec<SeedFile>, AppError> {
    let mut paths = Vec::new();
    fn visit(dir: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
        for item in fs::read_dir(dir)? {
            let p = item?.path();
            if p.is_dir() {
                visit(&p, paths)?;
            } else if p
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.ends_with(".seed.json"))
            {
                paths.push(p);
            }
        }
        Ok(())
    }
    visit(root, &mut paths)?;
    paths.sort();
    paths
        .into_iter()
        .map(|path| {
            let value: Value = serde_json::from_str(&fs::read_to_string(&path)?)?;
            let entries = value
                .as_array()
                .ok_or_else(|| {
                    AppError::Message(format!("{} root is not an array", path.display()))
                })?
                .clone();
            Ok(SeedFile { path, entries })
        })
        .collect()
}

fn draw(app: &App, terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> Result<(), io::Error> {
    terminal.draw(|frame| { let areas = Layout::default().direction(Direction::Vertical).constraints([Constraint::Length(3), Constraint::Min(8), Constraint::Length(7), Constraint::Length(3)]).split(frame.area());
        let title = Paragraph::new(format!("aAIdle seed fact checker  |  current: {}  |  model: {}  |  files: {}  entries: {}", app.current_name(), app.model, app.files.len(), app.total_entries())).block(Block::default().borders(Borders::ALL).title("Catalog")); frame.render_widget(title, areas[0]);
        let cols = Layout::default().direction(Direction::Horizontal).constraints([Constraint::Percentage(30), Constraint::Percentage(28), Constraint::Percentage(42)]).split(areas[1]);
        let files = List::new(app.files.iter().enumerate().map(|(i,f)| ListItem::new(format!("{} {}", if i==app.file {">"} else {" "}, f.path.strip_prefix(&app.root).unwrap_or(&f.path).display()))).collect::<Vec<_>>()).block(Block::default().borders(Borders::ALL).title("Seed files")); frame.render_widget(files, cols[0]);
        let fields = app.current_fields(); let list = List::new(fields.iter().enumerate().map(|(i,f)| ListItem::new(format!("{} {}", if i==app.field {">"} else {" "}, f))).collect::<Vec<_>>()).block(Block::default().borders(Borders::ALL).title(format!("Entry {}/{}", app.entry+1, app.files[app.file].entries.len()))); frame.render_widget(list, cols[1]);
        let selected = app.current_fields().get(app.field).cloned().unwrap_or_default(); let review = app.current_key().and_then(|k| app.reviews.get(&k)); let detail = format!("Field: {selected}\nValue: {}\n\n{}", app.current_value().map(|v| serde_json::to_string_pretty(v).unwrap_or_default()).unwrap_or_default(), review.map(|r| format!("Verdict: {}\nReason: {}\nYear annotation: {}\nFix: {}", r.verdict, r.rationale, r.year_annotation, r.fix.as_ref().map(|v| v.to_string()).unwrap_or_else(|| "none".into()))).unwrap_or_else(|| "Not checked".into())); frame.render_widget(Paragraph::new(detail).wrap(Wrap { trim: false }).block(Block::default().borders(Borders::ALL).title("Review")), cols[2]);
        let fields = app.current_fields();
        let current_reviewed = fields.iter().filter(|field| app.reviews.contains_key(&(app.file, app.entry, (*field).clone()))).count();
        let estimate = if app.reviewed_fields() > 0 { format!("${:.5}", app.estimate_all()) } else { "n/a".into() };
        let stats = Paragraph::new(format!("{}\nCache: .aaidle-seed-tui-cache.json\nCurrent entry fields: {}/{} | catalog fields reviewed: {}/{} | run entries completed: {} | total cost: ${:.5} | estimated all: {}", app.message, current_reviewed, fields.len(), app.reviewed_fields(), app.total_fields(), app.entries_done, app.total_cost, estimate)).block(Block::default().borders(Borders::ALL).title("Status")); frame.render_widget(stats, areas[2]);
        let help = Paragraph::new("↑/↓ field  ←/→ file  n next entry  c check  a apply fix  r run all  y/n accept/decline fixes  Enter continue  q quit").style(Style::default().fg(Color::Yellow)).block(Block::default().borders(Borders::ALL)); frame.render_widget(help, areas[3]);
    }).map(|_| ())
}

#[tokio::main]
async fn main() -> Result<(), AppError> {
    let root = env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."));
    let files = discover(&root)?;
    if files.is_empty() {
        return Err(AppError::Message(format!(
            "No *.seed.json files found below {}",
            root.display()
        )));
    }
    let mut app = App::new(root, files)?;
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;
    let result = loop {
        draw(&app, &mut terminal)?;
        if !event::poll(Duration::from_millis(100))? {
            continue;
        }
        if let Event::Key(KeyEvent {
            code, modifiers, ..
        }) = event::read()?
        {
            if code == KeyCode::Char('q')
                || (code == KeyCode::Char('c') && modifiers.contains(KeyModifiers::CONTROL))
            {
                break Ok(());
            }
            if app.running {
                continue;
            }
            if app.checkpoint {
                if code == KeyCode::Char('q') {
                    break Ok(());
                }
                if app.approval_pending
                    && (code == KeyCode::Char('y') || code == KeyCode::Char('n'))
                {
                    if code == KeyCode::Char('y') {
                        if let Err(e) = app.apply_pending() {
                            app.message = e.to_string();
                            continue;
                        }
                    } else {
                        app.pending_fixes.clear();
                        app.message = "Declined batch fixes".into();
                    }
                    app.approval_pending = false;
                    app.checkpoint = false;
                    app.batch_cost = 0.0;
                    if let Err(e) = app.run_all(&mut terminal).await {
                        app.message = e.to_string();
                    }
                } else if code == KeyCode::Enter {
                    app.approval_pending = false;
                    app.checkpoint = false;
                    app.batch_cost = 0.0;
                    if let Err(e) = app.run_all(&mut terminal).await {
                        app.message = e.to_string();
                    }
                }
                continue;
            }
            match code {
                KeyCode::Up => app.field = app.field.saturating_sub(1),
                KeyCode::Down => {
                    if app.field + 1 < app.current_fields().len() {
                        app.field += 1;
                    }
                }
                KeyCode::Left => {
                    app.file = app.file.saturating_sub(1);
                    app.entry = 0;
                    app.field = 0;
                }
                KeyCode::Right => {
                    if app.file + 1 < app.files.len() {
                        app.file += 1;
                        app.entry = 0;
                        app.field = 0;
                    }
                }
                KeyCode::Char('n') => app.select_next_entry(),
                KeyCode::Char('c') => {
                    if let Err(e) = app.check_current(&mut terminal).await {
                        app.message = e.to_string();
                    }
                }
                KeyCode::Char('a') => {
                    if let Err(e) = app.apply_current() {
                        app.message = e.to_string();
                    }
                }
                KeyCode::Char('r') => {
                    app.run_field = app.current_fields().get(app.field).cloned();
                    app.next_file = 0;
                    app.next_entry = 0;
                    app.entries_done = 0;
                    app.batch_cost = 0.0;
                    app.total_cost = 0.0;
                    app.pending_fixes.clear();
                    if let Err(e) = app.run_all(&mut terminal).await {
                        app.message = e.to_string();
                    }
                }
                _ => {}
            }
        }
    };
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    result
}
