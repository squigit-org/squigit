// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub mod types;
pub mod profile;
pub mod storage;
pub mod brain;

#[cfg(feature = "desktop")]
pub mod media;
#[cfg(feature = "desktop")]
pub mod platform;
