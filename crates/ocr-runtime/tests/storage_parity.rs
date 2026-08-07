// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use ocr_runtime::ocr::{boxes_to_storage_regions, persist_boxes_to_thread_storage, OcrBox};
use squigit_storage::{OcrAnnotationEntry, ThreadData, ThreadMetadata, ThreadStorage};

#[test]
fn cli_style_ocr_write_is_renderable_through_shared_thread_storage_annotations() {
    let temp = tempfile::tempdir().expect("tempdir");
    let storage_root = temp.path().join("threads");
    let storage = ThreadStorage::with_base_dir(storage_root).expect("thread storage");

    let metadata = ThreadMetadata::new("Parity Thread".to_string(), "deadbeef".to_string());
    let initial = squigit_storage::AttachmentManifestEntry {
        attachment_hash: metadata.image_hash.clone(),
        display_name: "squigitshot.png".to_string(),
        file_type: squigit_storage::AttachmentFileType::ImageUpload,
        file_brief: None,
        last_mention_at: metadata.created_at,
    };
    storage
        .save_thread(&ThreadData::new(metadata.clone(), initial))
        .expect("save thread");

    let boxes = vec![OcrBox {
        text: "Hello from cli renderer".to_string(),
        box_coords: vec![
            vec![10.2, 20.8],
            vec![30.1, 20.2],
            vec![30.9, 40.7],
            vec![10.3, 40.2],
        ],
        confidence: 0.99,
    }];
    persist_boxes_to_thread_storage(&storage, &metadata.id, "pp-ocr-v5-en", &boxes)
        .expect("save ocr annotations");
    let regions = boxes_to_storage_regions(&boxes);

    let annotations = storage
        .get_ocr_annotations(&metadata.id)
        .expect("load annotations");
    let restored = annotations
        .get("pp-ocr-v5-en")
        .and_then(|entry| match entry {
            OcrAnnotationEntry::Model(model) => Some(model.ocr_data.clone()),
            OcrAnnotationEntry::EmptyState(_) => None,
        })
        .expect("model annotations should be populated");

    assert_eq!(restored.len(), regions.len());
    assert_eq!(restored[0].text, regions[0].text);
    assert_eq!(restored[0].bbox, regions[0].bbox);
}

#[test]
fn invalid_model_id_is_still_rejected_by_shared_storage_contract() {
    let temp = tempfile::tempdir().expect("tempdir");
    let storage =
        ThreadStorage::with_base_dir(temp.path().join("threads")).expect("thread storage");

    let result = storage.save_ocr_data("thread-1", "unsupported-model", &[]);
    assert!(result.is_err(), "invalid model IDs must keep failing");
}
