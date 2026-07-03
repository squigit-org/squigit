use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, measure_payload: bool) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Package PaddleOCR, verify its runtime payload, and optionally measure compressed size.
    **************************/

    runtime.success("[mock] building paddle-ocr");
    if measure_payload {
        println!(
            "\nOCR payload size\n  target     x86_64-unknown-linux-gnu\n  files      18,742\n  unpacked   1.42 GiB\n  compressed 512.6 MiB\n  report     target/ocr-size/ocr-size-x86_64-unknown-linux-gnu.json\n\nLargest entries\n  184.3 MiB  paddle/libs/libpaddle_inference.so\n   96.8 MiB  paddle/libs/libmkldnn.so\n   71.4 MiB  models/PP-OCRv5_server_rec_infer"
        );
    }
    Ok(())
}
