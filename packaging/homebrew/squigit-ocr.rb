class SquigitOcr < Formula
  desc "Standalone purely headless CLI OCR engine for Squigit"
  homepage "https://github.com/squigit-org/squigit"
  # Source template: release CI copies this file into the tap repo, then fills metadata via pkg.rb.
  url "INSERT_URL_HERE"
  sha256 "INSERT_SHA256_HERE"
  version "INSERT_VERSION_HERE"

  def install
    unless OS.mac? && Hardware::CPU.arm?
      odie "squigit-ocr currently supports macOS arm64 (Apple Silicon) only."
    end

    libexec.install Dir["*"]
    bin.install_symlink libexec/"squigit-ocr"
  end

  test do
    system "#{bin}/squigit-ocr", "--help"
    system "#{bin}/squigit-ocr", "--version"
  end
end
