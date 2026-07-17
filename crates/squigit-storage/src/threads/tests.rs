// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;

use crate::error::StorageError;
use crate::threads::{
    OcrAnnotationEntry, OcrRegion, ThreadAttachmentKind, ThreadAttachmentRecord, ThreadData,
    ThreadMetadata, ThreadStorage, EMPTY_STATE_ASSET_ID,
};

fn make_test_storage() -> (ThreadStorage, PathBuf) {
    let base_dir =
        std::env::temp_dir().join(format!("squigit-storage-test-{}", uuid::Uuid::new_v4()));
    let storage = ThreadStorage::with_base_dir(base_dir.clone()).expect("storage init");
    (storage, base_dir)
}

#[test]
fn empty_state_asset_is_preserved_and_does_not_overwrite_english() {
    let (storage, base_dir) = make_test_storage();
    let metadata = ThreadMetadata::new("Test".to_string(), "0".repeat(64));
    let thread = ThreadData::new(metadata.clone());
    storage.save_thread(&thread).expect("save thread");

    let en_regions = vec![OcrRegion {
        text: "hello".to_string(),
        bbox: vec![vec![0, 0], vec![10, 0], vec![10, 10], vec![0, 10]],
    }];

    storage
        .save_ocr_data(&metadata.id, "pp-ocr-v5-en", &en_regions)
        .expect("save english ocr");

    let annotations = storage
        .get_ocr_annotations(&metadata.id)
        .expect("load annotations");
    let en = annotations
        .get("pp-ocr-v5-en")
        .and_then(|entry| match entry {
            OcrAnnotationEntry::Model(model) => Some(&model.ocr_data),
            OcrAnnotationEntry::EmptyState(_) => None,
        })
        .expect("english ocr present");
    assert_eq!(en.len(), 1);

    let empty_state_asset = annotations
        .get(EMPTY_STATE_ASSET_ID)
        .and_then(|entry| match entry {
            OcrAnnotationEntry::EmptyState(items) => Some(items),
            OcrAnnotationEntry::Model(_) => None,
        })
        .expect("empty-state asset present");
    assert!(empty_state_asset.is_empty());

    let _ = std::fs::remove_dir_all(base_dir);
}

#[test]
fn invalid_ocr_model_id_returns_error() {
    let (storage, base_dir) = make_test_storage();
    let result = storage.save_ocr_data("thread-1", "bogus-model", &[]);

    assert!(matches!(result, Err(StorageError::InvalidOcrModel(_))));

    let _ = std::fs::remove_dir_all(base_dir);
}

#[test]
fn attachment_registry_round_trips_via_sidecar() {
    let (storage, base_dir) = make_test_storage();
    let metadata = ThreadMetadata::new("Registry".to_string(), "0".repeat(64));
    let mut thread = ThreadData::new(metadata.clone());
    thread.attachment_registry.insert(
        "/tmp/threads/objects/ab/file.pdf".to_string(),
        ThreadAttachmentRecord {
            cas_path: "/tmp/threads/objects/ab/file.pdf".to_string(),
            display_name: "file.pdf".to_string(),
            kind: ThreadAttachmentKind::DocumentUpload,
            mime_type: "application/pdf".to_string(),
            source_path: None,
            provider_file: None,
            last_seen_at: chrono::Utc::now(),
            last_recalled_at: None,
        },
    );

    storage.save_thread(&thread).expect("save with registry");

    let loaded = storage
        .load_thread(&metadata.id)
        .expect("load with registry");
    assert_eq!(loaded.attachment_registry.len(), 1);
    assert!(loaded
        .attachment_registry
        .contains_key("/tmp/threads/objects/ab/file.pdf"));

    let mut cleared = loaded;
    cleared.attachment_registry.clear();
    storage
        .save_thread(&cleared)
        .expect("save cleared registry");

    let loaded_cleared = storage
        .load_thread(&metadata.id)
        .expect("load cleared registry");
    assert!(loaded_cleared.attachment_registry.is_empty());

    let _ = std::fs::remove_dir_all(base_dir);
}
