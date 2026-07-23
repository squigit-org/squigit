// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;

use crate::error::StorageError;
use crate::threads::{
    AttachmentManifestEntry, OcrAnnotationEntry, OcrRegion, ThreadData, ThreadMetadata,
    ThreadStorage, EMPTY_STATE_ASSET_ID,
};

fn test_initial_attachment(hash: String) -> AttachmentManifestEntry {
    AttachmentManifestEntry {
        attachment_hash: hash,
        display_name: "squigitshot.png".to_string(),
        file_type: crate::AttachmentFileType::ImageUpload,
        file_brief: None,
        last_mention_at: chrono::Utc::now(),
    }
}

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
    let thread = ThreadData::new(
        metadata.clone(),
        test_initial_attachment(metadata.image_hash.clone()),
    );
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
