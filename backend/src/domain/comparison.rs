use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct CategoryDetails {
    #[serde(rename = "language-model")]
    pub language_model: Option<LanguageModelDetails>,
    #[serde(rename = "computer-vision")]
    pub computer_vision: Option<ComputerVisionDetails>,
    pub nlp: Option<NlpDetails>,
    #[serde(rename = "object-detection")]
    pub object_detection: Option<ObjectDetectionDetails>,
    #[serde(rename = "classical-ml")]
    pub classical_ml: Option<ClassicalMlDetails>,
    pub filters: Option<FilterDetails>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageModelDetails {
    #[serde(default)]
    pub supported_languages: Vec<String>,
    #[serde(default)]
    pub architecture: Vec<String>,
    pub tool_use: Option<bool>,
    pub multimodal: Option<bool>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerVisionDetails {
    #[serde(default)]
    pub vision_tasks: Vec<String>,
    #[serde(default)]
    pub architecture: Vec<String>,
    #[serde(default)]
    pub training_datasets: Vec<String>,
    pub license: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpDetails {
    #[serde(default)]
    pub nlp_tasks: Vec<String>,
    #[serde(default)]
    pub supported_languages: Vec<String>,
    #[serde(default)]
    pub architecture: Vec<String>,
    #[serde(default)]
    pub training_datasets: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectDetectionDetails {
    #[serde(default)]
    pub detection_types: Vec<String>,
    #[serde(default)]
    pub architecture: Vec<String>,
    #[serde(default)]
    pub training_datasets: Vec<String>,
    pub real_time_capable: Option<bool>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicalMlDetails {
    #[serde(default)]
    pub algorithm_types: Vec<String>,
    #[serde(default)]
    pub learning_paradigms: Vec<String>,
    #[serde(default)]
    pub objectives: Vec<String>,
    #[serde(default)]
    pub feature_types: Vec<String>,
    #[serde(default)]
    pub frameworks: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterDetails {
    #[serde(default)]
    pub operation_types: Vec<String>,
    pub kernel_based: Option<bool>,
    #[serde(default)]
    pub kernel_sizes: Vec<String>,
    pub linearity: Option<String>,
    pub requires_training: Option<bool>,
    #[serde(default)]
    pub output_types: Vec<String>,
    #[serde(default)]
    pub frameworks: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct ComparableModel {
    pub id: String,
    pub provider: Option<String>,
    pub country: Option<String>,
    pub family: Vec<String>,
    pub categories: Vec<String>,
    pub input_modalities: Vec<String>,
    pub output_modalities: Vec<String>,
    pub use_cases: Vec<String>,
    pub reasoning_support: Option<String>,
    pub weight_availability: Option<String>,
    pub release_date: Option<String>,
    pub context_window_tokens: Option<i64>,
    pub category_details: CategoryDetails,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ComparisonResult {
    Correct,
    Partial,
    Incorrect,
    Higher,
    Lower,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicComparison {
    pub provider: ComparisonResult,
    pub country: ComparisonResult,
    pub family: ComparisonResult,
    pub categories: ComparisonResult,
    pub input_modalities: ComparisonResult,
    pub output_modalities: ComparisonResult,
    pub use_cases: ComparisonResult,
    pub reasoning_support: ComparisonResult,
    pub weight_availability: ComparisonResult,
    pub release: ComparisonResult,
    pub context_window_tokens: ComparisonResult,
    pub supported_languages: ComparisonResult,
    pub tool_use: ComparisonResult,
    pub multimodal: ComparisonResult,
    pub vision_tasks: ComparisonResult,
    pub architecture: ComparisonResult,
    pub training_datasets: ComparisonResult,
    pub license: ComparisonResult,
    pub nlp_tasks: ComparisonResult,
    pub detection_types: ComparisonResult,
    pub real_time_capable: ComparisonResult,
    pub algorithm_types: ComparisonResult,
    pub learning_paradigms: ComparisonResult,
    pub objectives: ComparisonResult,
    pub feature_types: ComparisonResult,
    pub frameworks: ComparisonResult,
    pub operation_types: ComparisonResult,
    pub kernel_based: ComparisonResult,
    pub kernel_sizes: ComparisonResult,
    pub linearity: ComparisonResult,
    pub requires_training: ComparisonResult,
    pub output_types: ComparisonResult,
}

#[derive(Clone, Debug, Default)]
pub struct MatchingValues {
    pub family: Vec<String>,
    pub categories: Vec<String>,
    pub input_modalities: Vec<String>,
    pub output_modalities: Vec<String>,
    pub use_cases: Vec<String>,
}

impl ClassicComparison {
    pub fn selected(&self, columns: &[&str]) -> BTreeMap<String, ComparisonResult> {
        columns
            .iter()
            .map(|column| ((*column).to_owned(), self.field(column)))
            .collect()
    }

    fn field(&self, field: &str) -> ComparisonResult {
        match field {
            "provider" => self.provider,
            "country" => self.country,
            "family" => self.family,
            "categories" => self.categories,
            "inputModalities" => self.input_modalities,
            "outputModalities" => self.output_modalities,
            "useCases" => self.use_cases,
            "reasoningSupport" => self.reasoning_support,
            "weightAvailability" => self.weight_availability,
            "release" => self.release,
            "contextWindowTokens" => self.context_window_tokens,
            "supportedLanguages" => self.supported_languages,
            "toolUse" => self.tool_use,
            "multimodal" => self.multimodal,
            "visionTasks" => self.vision_tasks,
            "architecture" => self.architecture,
            "trainingDatasets" => self.training_datasets,
            "license" => self.license,
            "nlpTasks" => self.nlp_tasks,
            "detectionTypes" => self.detection_types,
            "realTimeCapable" => self.real_time_capable,
            "algorithmTypes" => self.algorithm_types,
            "learningParadigms" => self.learning_paradigms,
            "objectives" => self.objectives,
            "featureTypes" => self.feature_types,
            "frameworks" => self.frameworks,
            "operationTypes" => self.operation_types,
            "kernelBased" => self.kernel_based,
            "kernelSizes" => self.kernel_sizes,
            "linearity" => self.linearity,
            "requiresTraining" => self.requires_training,
            "outputTypes" => self.output_types,
            _ => ComparisonResult::Unknown,
        }
    }
}

pub fn compare_models(guessed: &ComparableModel, answer: &ComparableModel) -> ClassicComparison {
    let guessed_details = &guessed.category_details;
    let answer_details = &answer.category_details;
    ClassicComparison {
        provider: compare_scalar(guessed.provider.as_deref(), answer.provider.as_deref()),
        country: compare_scalar(guessed.country.as_deref(), answer.country.as_deref()),
        family: compare_sets(Some(&guessed.family), Some(&answer.family)),
        categories: compare_sets(Some(&guessed.categories), Some(&answer.categories)),
        input_modalities: compare_sets(
            Some(&guessed.input_modalities),
            Some(&answer.input_modalities),
        ),
        output_modalities: compare_sets(
            Some(&guessed.output_modalities),
            Some(&answer.output_modalities),
        ),
        use_cases: compare_sets(Some(&guessed.use_cases), Some(&answer.use_cases)),
        reasoning_support: compare_scalar(
            guessed.reasoning_support.as_deref(),
            answer.reasoning_support.as_deref(),
        ),
        weight_availability: compare_scalar(
            guessed.weight_availability.as_deref(),
            answer.weight_availability.as_deref(),
        ),
        release: compare_number(
            release_quarter(guessed.release_date.as_deref()),
            release_quarter(answer.release_date.as_deref()),
        ),
        context_window_tokens: compare_number(
            guessed.context_window_tokens,
            answer.context_window_tokens,
        ),
        supported_languages: compare_sets(
            language(guessed_details)
                .map(|value| &value.supported_languages)
                .or_else(|| nlp(guessed_details).map(|value| &value.supported_languages)),
            language(answer_details)
                .map(|value| &value.supported_languages)
                .or_else(|| nlp(answer_details).map(|value| &value.supported_languages)),
        ),
        tool_use: compare_tool_use(
            language(guessed_details).and_then(|value| value.tool_use),
            language(answer_details).and_then(|value| value.tool_use),
        ),
        multimodal: compare_boolean(
            language(guessed_details).and_then(|value| value.multimodal),
            language(answer_details).and_then(|value| value.multimodal),
        ),
        vision_tasks: compare_sets(
            vision(guessed_details).map(|value| &value.vision_tasks),
            vision(answer_details).map(|value| &value.vision_tasks),
        ),
        architecture: compare_sets(
            language(guessed_details)
                .map(|value| &value.architecture)
                .or_else(|| vision(guessed_details).map(|value| &value.architecture))
                .or_else(|| nlp(guessed_details).map(|value| &value.architecture))
                .or_else(|| detection(guessed_details).map(|value| &value.architecture)),
            language(answer_details)
                .map(|value| &value.architecture)
                .or_else(|| vision(answer_details).map(|value| &value.architecture))
                .or_else(|| nlp(answer_details).map(|value| &value.architecture))
                .or_else(|| detection(answer_details).map(|value| &value.architecture)),
        ),
        training_datasets: compare_sets(
            vision(guessed_details)
                .map(|value| &value.training_datasets)
                .or_else(|| nlp(guessed_details).map(|value| &value.training_datasets))
                .or_else(|| detection(guessed_details).map(|value| &value.training_datasets)),
            vision(answer_details)
                .map(|value| &value.training_datasets)
                .or_else(|| nlp(answer_details).map(|value| &value.training_datasets))
                .or_else(|| detection(answer_details).map(|value| &value.training_datasets)),
        ),
        license: compare_scalar(
            vision(guessed_details).and_then(|value| value.license.as_deref()),
            vision(answer_details).and_then(|value| value.license.as_deref()),
        ),
        nlp_tasks: compare_sets(
            nlp(guessed_details).map(|value| &value.nlp_tasks),
            nlp(answer_details).map(|value| &value.nlp_tasks),
        ),
        detection_types: compare_sets(
            detection(guessed_details).map(|value| &value.detection_types),
            detection(answer_details).map(|value| &value.detection_types),
        ),
        real_time_capable: compare_boolean(
            detection(guessed_details).and_then(|value| value.real_time_capable),
            detection(answer_details).and_then(|value| value.real_time_capable),
        ),
        algorithm_types: compare_sets(
            classical(guessed_details).map(|value| &value.algorithm_types),
            classical(answer_details).map(|value| &value.algorithm_types),
        ),
        learning_paradigms: compare_sets(
            classical(guessed_details).map(|value| &value.learning_paradigms),
            classical(answer_details).map(|value| &value.learning_paradigms),
        ),
        objectives: compare_sets(
            classical(guessed_details).map(|value| &value.objectives),
            classical(answer_details).map(|value| &value.objectives),
        ),
        feature_types: compare_sets(
            classical(guessed_details).map(|value| &value.feature_types),
            classical(answer_details).map(|value| &value.feature_types),
        ),
        frameworks: compare_sets(
            classical(guessed_details)
                .map(|value| &value.frameworks)
                .or_else(|| filters(guessed_details).map(|value| &value.frameworks)),
            classical(answer_details)
                .map(|value| &value.frameworks)
                .or_else(|| filters(answer_details).map(|value| &value.frameworks)),
        ),
        operation_types: compare_sets(
            filters(guessed_details).map(|value| &value.operation_types),
            filters(answer_details).map(|value| &value.operation_types),
        ),
        kernel_based: compare_boolean(
            filters(guessed_details).and_then(|value| value.kernel_based),
            filters(answer_details).and_then(|value| value.kernel_based),
        ),
        kernel_sizes: compare_sets(
            filters(guessed_details).map(|value| &value.kernel_sizes),
            filters(answer_details).map(|value| &value.kernel_sizes),
        ),
        linearity: compare_scalar(
            filters(guessed_details).and_then(|value| value.linearity.as_deref()),
            filters(answer_details).and_then(|value| value.linearity.as_deref()),
        ),
        requires_training: compare_boolean(
            filters(guessed_details).and_then(|value| value.requires_training),
            filters(answer_details).and_then(|value| value.requires_training),
        ),
        output_types: compare_sets(
            filters(guessed_details).map(|value| &value.output_types),
            filters(answer_details).map(|value| &value.output_types),
        ),
    }
}

pub fn matching_values(guessed: &ComparableModel, answer: &ComparableModel) -> MatchingValues {
    MatchingValues {
        family: matching_items(&guessed.family, &answer.family),
        categories: matching_items(&guessed.categories, &answer.categories),
        input_modalities: matching_items(&guessed.input_modalities, &answer.input_modalities),
        output_modalities: matching_items(&guessed.output_modalities, &answer.output_modalities),
        use_cases: matching_items(&guessed.use_cases, &answer.use_cases),
    }
}

fn normalized(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(['–', '—'], "-")
        .replace([' ', '_'], "-")
}

fn language(details: &CategoryDetails) -> Option<&LanguageModelDetails> {
    details.language_model.as_ref()
}

fn vision(details: &CategoryDetails) -> Option<&ComputerVisionDetails> {
    details.computer_vision.as_ref()
}

fn nlp(details: &CategoryDetails) -> Option<&NlpDetails> {
    details.nlp.as_ref()
}

fn detection(details: &CategoryDetails) -> Option<&ObjectDetectionDetails> {
    details.object_detection.as_ref()
}

fn classical(details: &CategoryDetails) -> Option<&ClassicalMlDetails> {
    details.classical_ml.as_ref()
}

fn filters(details: &CategoryDetails) -> Option<&FilterDetails> {
    details.filters.as_ref()
}

fn is_unknown(value: &str) -> bool {
    normalized(value) == "unknown"
}

fn compare_scalar(guessed: Option<&str>, answer: Option<&str>) -> ComparisonResult {
    match (guessed, answer) {
        (None, None) => ComparisonResult::Correct,
        (Some(left), Some(right)) if is_unknown(left) || is_unknown(right) => {
            if is_unknown(left) && is_unknown(right) {
                ComparisonResult::Correct
            } else {
                ComparisonResult::Unknown
            }
        }
        (Some(left), Some(right)) if normalized(left) == normalized(right) => {
            ComparisonResult::Correct
        }
        (Some(_), Some(_)) => ComparisonResult::Incorrect,
        _ => ComparisonResult::Unknown,
    }
}

fn compare_boolean(guessed: Option<bool>, answer: Option<bool>) -> ComparisonResult {
    match (guessed, answer) {
        (None, None) => ComparisonResult::Correct,
        (Some(left), Some(right)) if left == right => ComparisonResult::Correct,
        (Some(_), Some(_)) => ComparisonResult::Incorrect,
        _ => ComparisonResult::Unknown,
    }
}

fn compare_tool_use(guessed: Option<bool>, answer: Option<bool>) -> ComparisonResult {
        if guessed.unwrap_or(false) == answer.unwrap_or(false) {
                ComparisonResult::Correct
        } else {
                ComparisonResult::Incorrect
        }
}

fn compare_sets(guessed: Option<&Vec<String>>, answer: Option<&Vec<String>>) -> ComparisonResult {
    let (Some(guessed), Some(answer)) = (guessed, answer) else {
        return if guessed.is_none() && answer.is_none() {
            ComparisonResult::Correct
        } else {
            ComparisonResult::Unknown
        };
    };
    if guessed.is_empty() || answer.is_empty() {
        return if guessed.is_empty() && answer.is_empty() {
            ComparisonResult::Correct
        } else {
            ComparisonResult::Unknown
        };
    }
    if guessed.iter().any(|value| is_unknown(value)) || answer.iter().any(|value| is_unknown(value))
    {
        return if guessed.iter().all(|value| is_unknown(value))
            && answer.iter().all(|value| is_unknown(value))
        {
            ComparisonResult::Correct
        } else {
            ComparisonResult::Unknown
        };
    }
    let left = guessed
        .iter()
        .map(|value| normalized(value))
        .collect::<BTreeSet<_>>();
    let right = answer
        .iter()
        .map(|value| normalized(value))
        .collect::<BTreeSet<_>>();
    if left == right {
        ComparisonResult::Correct
    } else if left.iter().any(|value| right.contains(value)) {
        ComparisonResult::Partial
    } else {
        ComparisonResult::Incorrect
    }
}

fn matching_items(guessed: &[String], answer: &[String]) -> Vec<String> {
    if guessed.is_empty()
        || answer.is_empty()
        || guessed.iter().any(|value| is_unknown(value))
        || answer.iter().any(|value| is_unknown(value))
    {
        return Vec::new();
    }
    let answer = answer
        .iter()
        .map(|value| normalized(value))
        .collect::<BTreeSet<_>>();
    guessed
        .iter()
        .filter(|value| answer.contains(&normalized(value)))
        .cloned()
        .collect()
}

fn compare_number(guessed: Option<i64>, answer: Option<i64>) -> ComparisonResult {
    match (guessed, answer) {
        (None, None) => ComparisonResult::Correct,
        (Some(left), Some(right)) if left == right => ComparisonResult::Correct,
        (Some(left), Some(right)) if right > left => ComparisonResult::Higher,
        (Some(_), Some(_)) => ComparisonResult::Lower,
        _ => ComparisonResult::Unknown,
    }
}

fn release_quarter(date: Option<&str>) -> Option<i64> {
    let date = date?;
    let year = date.get(..4)?.parse::<i64>().ok()?;
    let month = date.get(5..7)?.parse::<i64>().ok()?;
    (1..=12)
        .contains(&month)
        .then_some(year * 4 + (month + 2) / 3)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model() -> ComparableModel {
        ComparableModel {
            id: "one".to_owned(),
            provider: Some("OpenAI".to_owned()),
            country: None,
            family: Vec::new(),
            categories: vec!["language-model".to_owned(), "coding".to_owned()],
            input_modalities: Vec::new(),
            output_modalities: Vec::new(),
            use_cases: Vec::new(),
            reasoning_support: None,
            weight_availability: None,
            release_date: Some("2024-05-13".to_owned()),
            context_window_tokens: Some(128_000),
            category_details: CategoryDetails::default(),
        }
    }

    #[test]
    fn compares_sets_independent_of_order_and_detects_partial_matches() {
        let mut guessed = model();
        guessed.categories.reverse();
        assert_eq!(
            compare_models(&guessed, &model()).categories,
            ComparisonResult::Correct
        );
        guessed.categories = vec!["coding".to_owned(), "vision".to_owned()];
        assert_eq!(
            compare_models(&guessed, &model()).categories,
            ComparisonResult::Partial
        );
    }

    #[test]
    fn compares_rich_category_metadata_and_release_quarters() {
        let mut guessed = model();
        guessed.category_details.language_model = Some(LanguageModelDetails {
            supported_languages: vec!["English".to_owned()],
            tool_use: Some(false),
            ..Default::default()
        });
        let mut answer = model();
        answer.release_date = Some("2024-10-01".to_owned());
        answer.category_details.language_model = Some(LanguageModelDetails {
            supported_languages: vec!["English".to_owned(), "French".to_owned()],
            tool_use: Some(true),
            ..Default::default()
        });
        let result = compare_models(&guessed, &answer);
        assert_eq!(result.release, ComparisonResult::Higher);
        assert_eq!(result.supported_languages, ComparisonResult::Partial);
        assert_eq!(result.tool_use, ComparisonResult::Incorrect);
    }

    #[test]
    fn treats_missing_tool_calling_metadata_as_no() {
        let mut no_tool_use = model();
        no_tool_use.category_details.language_model = Some(LanguageModelDetails {
            tool_use: Some(false),
            ..Default::default()
        });
        let mut yes_tool_use = no_tool_use.clone();
        yes_tool_use.category_details.language_model = Some(LanguageModelDetails {
            tool_use: Some(true),
            ..Default::default()
        });

        let answer = model();

        assert_eq!(
            compare_models(&no_tool_use, &answer).tool_use,
            ComparisonResult::Correct
        );
        assert_eq!(
            compare_models(&yes_tool_use, &answer).tool_use,
            ComparisonResult::Incorrect
        );
    }
}
