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

#[test]
fn scalar_boolean_number_and_set_comparisons_cover_unknown_and_ordering_cases() {
    assert_eq!(compare_scalar(None, None), ComparisonResult::Correct);
    assert_eq!(
        compare_scalar(Some("unknown"), Some("UNKNOWN")),
        ComparisonResult::Correct
    );
    assert_eq!(
        compare_scalar(Some("unknown"), Some("known")),
        ComparisonResult::Unknown
    );
    assert_eq!(
        compare_scalar(Some("known"), Some("unknown")),
        ComparisonResult::Unknown
    );
    assert_eq!(
        compare_scalar(Some("Open AI"), Some("open_ai")),
        ComparisonResult::Correct
    );
    assert_eq!(
        compare_scalar(Some("OpenAI"), Some("Anthropic")),
        ComparisonResult::Incorrect
    );
    assert_eq!(
        compare_scalar(Some("OpenAI"), None),
        ComparisonResult::Unknown
    );

    assert_eq!(compare_boolean(None, None), ComparisonResult::Correct);
    assert_eq!(
        compare_boolean(Some(true), Some(true)),
        ComparisonResult::Correct
    );
    assert_eq!(
        compare_boolean(Some(true), Some(false)),
        ComparisonResult::Incorrect
    );
    assert_eq!(
        compare_boolean(None, Some(false)),
        ComparisonResult::Unknown
    );

    assert_eq!(compare_number(None, None), ComparisonResult::Correct);
    assert_eq!(compare_number(Some(4), Some(4)), ComparisonResult::Correct);
    assert_eq!(compare_number(Some(4), Some(5)), ComparisonResult::Higher);
    assert_eq!(compare_number(Some(5), Some(4)), ComparisonResult::Lower);
    assert_eq!(compare_number(Some(4), None), ComparisonResult::Unknown);

    let empty = Vec::new();
    let unknown = vec!["unknown".to_owned()];
    let mixed_unknown = vec!["unknown".to_owned(), "known".to_owned()];
    let known = vec!["known".to_owned()];
    let other = vec!["other".to_owned()];
    assert_eq!(compare_sets(None, None), ComparisonResult::Correct);
    assert_eq!(compare_sets(Some(&known), None), ComparisonResult::Unknown);
    assert_eq!(compare_sets(None, Some(&known)), ComparisonResult::Unknown);
    assert_eq!(
        compare_sets(Some(&empty), Some(&empty)),
        ComparisonResult::Correct
    );
    assert_eq!(
        compare_sets(Some(&empty), Some(&known)),
        ComparisonResult::Unknown
    );
    assert_eq!(
        compare_sets(Some(&known), Some(&empty)),
        ComparisonResult::Unknown
    );
    assert_eq!(
        compare_sets(Some(&unknown), Some(&unknown)),
        ComparisonResult::Correct
    );
    assert_eq!(
        compare_sets(Some(&unknown), Some(&mixed_unknown)),
        ComparisonResult::Unknown
    );
    assert_eq!(
        compare_sets(Some(&mixed_unknown), Some(&unknown)),
        ComparisonResult::Unknown
    );
    assert_eq!(
        compare_sets(Some(&known), Some(&unknown)),
        ComparisonResult::Unknown
    );
    assert_eq!(
        compare_sets(Some(&known), Some(&other)),
        ComparisonResult::Incorrect
    );
}

#[test]
fn matching_values_preserve_guessed_spelling_and_ignore_unknown_or_missing_values() {
    let mut guessed = model();
    guessed.family = vec!["GPT — 4".to_owned(), "Other".to_owned()];
    guessed.input_modalities = vec!["unknown".to_owned()];
    guessed.output_modalities = vec!["text".to_owned()];
    guessed.use_cases = Vec::new();
    let mut answer = model();
    answer.family = vec!["gpt---4".to_owned()];
    answer.input_modalities = vec!["text".to_owned()];
    answer.output_modalities = vec!["TEXT".to_owned()];
    answer.use_cases = vec!["coding".to_owned()];

    let matches = matching_values(&guessed, &answer);
    assert_eq!(matches.family, vec!["GPT — 4".to_owned()]);
    assert!(matches.input_modalities.is_empty());
    assert_eq!(matches.output_modalities, vec!["text".to_owned()]);
    assert!(matches.use_cases.is_empty());
    assert!(matching_items(&["value".to_owned()], &[]).is_empty());
    assert!(matching_items(&["value".to_owned()], &["unknown".to_owned()]).is_empty());
}

#[test]
fn rich_metadata_is_compared_and_every_selectable_column_is_exposed() {
    let mut rich = model();
    rich.country = Some("United States".to_owned());
    rich.family = vec!["family".to_owned()];
    rich.input_modalities = vec!["text".to_owned()];
    rich.output_modalities = vec!["text".to_owned()];
    rich.use_cases = vec!["coding".to_owned()];
    rich.reasoning_support = Some("native".to_owned());
    rich.weight_availability = Some("open".to_owned());
    rich.category_details = CategoryDetails {
        language_model: Some(LanguageModelDetails {
            supported_languages: vec!["English".to_owned()],
            architecture: vec!["Transformer".to_owned()],
            tool_use: Some(true),
            multimodal: Some(true),
        }),
        computer_vision: Some(ComputerVisionDetails {
            vision_tasks: vec!["classification".to_owned()],
            architecture: vec!["CNN".to_owned()],
            training_datasets: vec!["ImageNet".to_owned()],
            license: Some("Apache-2.0".to_owned()),
        }),
        nlp: Some(NlpDetails {
            nlp_tasks: vec!["translation".to_owned()],
            supported_languages: vec!["French".to_owned()],
            architecture: vec!["RNN".to_owned()],
            training_datasets: vec!["Corpus".to_owned()],
        }),
        object_detection: Some(ObjectDetectionDetails {
            detection_types: vec!["objects".to_owned()],
            architecture: vec!["YOLO".to_owned()],
            training_datasets: vec!["COCO".to_owned()],
            real_time_capable: Some(true),
        }),
        classical_ml: Some(ClassicalMlDetails {
            algorithm_types: vec!["tree".to_owned()],
            learning_paradigms: vec!["supervised".to_owned()],
            objectives: vec!["classification".to_owned()],
            feature_types: vec!["tabular".to_owned()],
            frameworks: vec!["sklearn".to_owned()],
        }),
        filters: Some(FilterDetails {
            operation_types: vec!["blur".to_owned()],
            kernel_based: Some(true),
            kernel_sizes: vec!["3x3".to_owned()],
            linearity: Some("linear".to_owned()),
            requires_training: Some(false),
            output_types: vec!["image".to_owned()],
            frameworks: vec!["opencv".to_owned()],
        }),
    };

    let comparison = compare_models(&rich, &rich);
    let columns = [
        "provider",
        "country",
        "family",
        "categories",
        "inputModalities",
        "outputModalities",
        "useCases",
        "reasoningSupport",
        "weightAvailability",
        "release",
        "contextWindowTokens",
        "supportedLanguages",
        "toolUse",
        "multimodal",
        "visionTasks",
        "architecture",
        "trainingDatasets",
        "license",
        "nlpTasks",
        "detectionTypes",
        "realTimeCapable",
        "algorithmTypes",
        "learningParadigms",
        "objectives",
        "featureTypes",
        "frameworks",
        "operationTypes",
        "kernelBased",
        "kernelSizes",
        "linearity",
        "requiresTraining",
        "outputTypes",
    ];
    let selected = comparison.selected(&columns);
    assert_eq!(selected.len(), columns.len());
    assert!(
        selected
            .values()
            .all(|result| *result == ComparisonResult::Correct)
    );
    assert_eq!(
        comparison.selected(&["notAColumn"])["notAColumn"],
        ComparisonResult::Unknown
    );
}

#[test]
fn release_quarter_rejects_malformed_dates_and_groups_valid_months() {
    assert_eq!(release_quarter(None), None);
    assert_eq!(release_quarter(Some("bad")), None);
    assert_eq!(release_quarter(Some("202x-01-01")), None);
    assert_eq!(release_quarter(Some("2024")), None);
    assert_eq!(release_quarter(Some("2024-aa-01")), None);
    assert_eq!(release_quarter(Some("2024-00-01")), None);
    assert_eq!(release_quarter(Some("2024-13-01")), None);
    assert_eq!(
        release_quarter(Some("2024-01-01")),
        release_quarter(Some("2024-03-31"))
    );
    assert_ne!(
        release_quarter(Some("2024-03-31")),
        release_quarter(Some("2024-04-01"))
    );
}
