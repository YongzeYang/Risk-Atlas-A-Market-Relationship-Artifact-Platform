#include <cmath>
#include <cstdint>
#include <filesystem>
#include <iostream>
#include <limits>
#include <span>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>

#include "bsm/append_row_writer.hpp"
#include "bsm/blocked_symmetric_matrix.hpp"

namespace {

using u64 = std::uint64_t;

struct Options {
  std::filesystem::path output_path;
  u64 block_size{0};
  u64 cache_blocks{8};
};

[[nodiscard]] u64 parse_u64(const std::string& text, const char* name) {
  std::size_t pos = 0;
  unsigned long long value = 0;

  try {
    value = std::stoull(text, &pos);
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string("Invalid integer for ") + name + ": " + text);
  }

  if (pos != text.size()) {
    throw std::invalid_argument(std::string("Invalid trailing characters for ") + name + ": " + text);
  }

  if (value > std::numeric_limits<u64>::max()) {
    throw std::overflow_error(std::string("Value overflows uint64_t for ") + name + ".");
  }

  return static_cast<u64>(value);
}

[[nodiscard]] double parse_double(const std::string& text, const char* name) {
  std::size_t pos = 0;
  double value = 0.0;

  try {
    value = std::stod(text, &pos);
  } catch (const std::exception&) {
    throw std::invalid_argument(std::string("Invalid floating-point value for ") + name + ": " + text);
  }

  if (pos != text.size()) {
    throw std::invalid_argument(std::string("Invalid trailing characters for ") + name + ": " + text);
  }

  if (!std::isfinite(value)) {
    throw std::invalid_argument(std::string("Non-finite floating-point value for ") + name + ": " + text);
  }

  return value;
}

void print_usage(const char* argv0) {
  std::cerr
  << "Usage: " << argv0 << " --output <path> [--block-size <n>] [--cache-blocks <n>]\n"
      << "\n"
  << "Reads a lower-triangle streaming payload from stdin:\n"
      << "  line 1: N\n"
      << "  next N lines: symbol strings\n"
  << "  next N lines: row i has i+1 whitespace-separated doubles (j=0..i)\n";
}

[[nodiscard]] Options parse_args(int argc, char** argv) {
  Options options;

  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];

    if (arg == "--help" || arg == "-h") {
      print_usage(argv[0]);
      std::exit(0);
    }

    if (i + 1 >= argc) {
      throw std::invalid_argument("Missing value after CLI flag: " + arg);
    }

    const std::string value = argv[++i];

    if (arg == "--output") {
      options.output_path = value;
    } else if (arg == "--block-size") {
      options.block_size = parse_u64(value, "block-size");
    } else if (arg == "--cache-blocks") {
      options.cache_blocks = parse_u64(value, "cache-blocks");
    } else {
      throw std::invalid_argument("Unknown CLI flag: " + arg);
    }
  }

  if (options.output_path.empty()) {
    throw std::invalid_argument("Missing required --output <path> argument.");
  }

  if (options.cache_blocks == 0) {
    throw std::invalid_argument("--cache-blocks must be > 0.");
  }

  return options;
}

[[nodiscard]] std::vector<std::string> read_symbols_from_stdin(std::size_t n) {
  std::vector<std::string> symbols;
  symbols.reserve(n);

  std::unordered_set<std::string> seen_symbols;

  for (std::size_t i = 0; i < n; ++i) {
    std::string symbol;
    if (!std::getline(std::cin, symbol)) {
      throw std::runtime_error("Failed to read symbol line " + std::to_string(i) + ".");
    }

    if (!symbol.empty() && symbol.back() == '\r') {
      symbol.pop_back();
    }

    if (symbol.empty()) {
      throw std::runtime_error("Encountered empty symbol at index " + std::to_string(i) + ".");
    }

    if (!seen_symbols.insert(symbol).second) {
      throw std::runtime_error("Duplicate symbol in input payload: " + symbol);
    }

    symbols.push_back(std::move(symbol));
  }

  return symbols;
}

[[nodiscard]] std::vector<std::string> read_header_from_stdin() {
  std::size_t n = 0;
  if (!(std::cin >> n)) {
    throw std::runtime_error("Failed to read matrix dimension from stdin.");
  }

  std::string dummy;
  std::getline(std::cin, dummy); // consume end-of-line after N

  if (n == 0) {
    throw std::runtime_error("Matrix dimension N must be > 0.");
  }

  return read_symbols_from_stdin(n);
}

[[nodiscard]] u64 derive_block_size(std::size_t n, u64 configured_block_size) {
  if (configured_block_size > 0) {
    return configured_block_size;
  }

  const u64 derived = static_cast<u64>(std::min<std::size_t>(16, std::max<std::size_t>(4, n)));
  return derived == 0 ? 1 : derived;
}

void write_bsm_artifact(const std::vector<std::string>& symbols, const Options& options) {
  const std::size_t n_size_t = symbols.size();
  const u64 n = static_cast<u64>(n_size_t);
  const u64 block_size = derive_block_size(n_size_t, options.block_size);

  if (const auto parent = options.output_path.parent_path(); !parent.empty()) {
    std::filesystem::create_directories(parent);
  }

  auto matrix = bsm::BlockedSymmetricMatrix<double>::create_file(
      options.output_path,
      n,
      block_size,
      options.cache_blocks);

  bsm::AppendRowWriter<double> writer(matrix);

  std::vector<double> lower_row;
  lower_row.reserve(n_size_t);

  for (std::size_t i = 0; i < n_size_t; ++i) {
    std::string row_text;
    if (!std::getline(std::cin, row_text)) {
      throw std::runtime_error("Failed to read lower-triangle row " + std::to_string(i) + ".");
    }

    if (!row_text.empty() && row_text.back() == '\r') {
      row_text.pop_back();
    }

    std::istringstream row_stream(row_text);
    lower_row.assign(i + 1, 0.0);

    for (std::size_t j = 0; j <= i; ++j) {
      std::string token;
      if (!(row_stream >> token)) {
        throw std::runtime_error(
            "Row " + std::to_string(i) +
            " has fewer values than expected; required " + std::to_string(i + 1) + " values.");
      }

      lower_row[j] = parse_double(token, "lower-triangle value");
    }

    std::string extra_token;
    if (row_stream >> extra_token) {
      throw std::runtime_error(
          "Row " + std::to_string(i) + " has extra trailing values beyond " + std::to_string(i + 1) + ".");
    }

    writer.append(std::span<const double>(lower_row.data(), lower_row.size()));
  }

  std::string trailing_token;
  if (std::cin >> trailing_token) {
    throw std::runtime_error("Unexpected trailing tokens after lower-triangle rows.");
  }

  matrix.flush();
}

} // namespace

int main(int argc, char** argv) {
  try {
    const Options options = parse_args(argc, argv);
    const std::vector<std::string> symbols = read_header_from_stdin();

    write_bsm_artifact(symbols, options);

    std::cout
        << "Wrote " << symbols.size()
        << "x" << symbols.size()
        << " matrix artifact to " << options.output_path.string()
        << '\n';

    return 0;
  } catch (const std::exception& ex) {
    std::cerr << "risk_atlas_bsm_writer failed: " << ex.what() << '\n';
    return 1;
  }
}