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
  double symmetry_tolerance{1e-8};
};

struct InputPayload {
  std::vector<std::string> symbols;
  std::vector<std::vector<double>> dense_scores;
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
      << "Usage: " << argv0 << " --output <path> [--block-size <n>] [--cache-blocks <n>] [--symmetry-tolerance <x>]\n"
      << "\n"
      << "Reads a dense symmetric matrix payload from stdin:\n"
      << "  line 1: N\n"
      << "  next N lines: symbol strings\n"
      << "  next N lines: N whitespace-separated doubles per row\n";
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
    } else if (arg == "--symmetry-tolerance") {
      options.symmetry_tolerance = parse_double(value, "symmetry-tolerance");
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

[[nodiscard]] InputPayload read_payload_from_stdin() {
  std::size_t n = 0;
  if (!(std::cin >> n)) {
    throw std::runtime_error("Failed to read matrix dimension from stdin.");
  }

  std::string dummy;
  std::getline(std::cin, dummy); // consume end-of-line after N

  if (n == 0) {
    throw std::runtime_error("Matrix dimension N must be > 0.");
  }

  InputPayload payload;
  payload.symbols.reserve(n);

  for (std::size_t i = 0; i < n; ++i) {
    std::string symbol;
    if (!std::getline(std::cin, symbol)) {
      throw std::runtime_error("Failed to read symbol line " + std::to_string(i) + ".");
    }

    if (symbol.empty()) {
      throw std::runtime_error("Encountered empty symbol at index " + std::to_string(i) + ".");
    }

    payload.symbols.push_back(std::move(symbol));
  }

  payload.dense_scores.assign(n, std::vector<double>(n, 0.0));

  for (std::size_t i = 0; i < n; ++i) {
    for (std::size_t j = 0; j < n; ++j) {
      double value = 0.0;
      if (!(std::cin >> value)) {
        throw std::runtime_error(
            "Failed to read dense matrix value at [" + std::to_string(i) + ", " + std::to_string(j) + "].");
      }

      if (!std::isfinite(value)) {
        throw std::runtime_error(
            "Encountered non-finite dense matrix value at [" + std::to_string(i) + ", " + std::to_string(j) + "].");
      }

      payload.dense_scores[i][j] = value;
    }
  }

  return payload;
}

void validate_payload(const InputPayload& payload, double symmetry_tolerance) {
  if (payload.symbols.empty()) {
    throw std::runtime_error("Input payload has no symbols.");
  }

  if (payload.dense_scores.size() != payload.symbols.size()) {
    throw std::runtime_error("Dense score matrix row count does not match symbol count.");
  }

  std::unordered_set<std::string> seen_symbols;
  for (const auto& symbol : payload.symbols) {
    if (!seen_symbols.insert(symbol).second) {
      throw std::runtime_error("Duplicate symbol in input payload: " + symbol);
    }
  }

  const std::size_t n = payload.symbols.size();

  for (std::size_t i = 0; i < n; ++i) {
    if (payload.dense_scores[i].size() != n) {
      throw std::runtime_error(
          "Dense score matrix row " + std::to_string(i) + " has incorrect column count.");
    }

    for (std::size_t j = i + 1; j < n; ++j) {
      const double a = payload.dense_scores[i][j];
      const double b = payload.dense_scores[j][i];

      if (std::abs(a - b) > symmetry_tolerance) {
        throw std::runtime_error(
            "Dense score matrix is not symmetric within tolerance at [" +
            std::to_string(i) + ", " + std::to_string(j) + "].");
      }
    }
  }
}

[[nodiscard]] u64 derive_block_size(std::size_t n, u64 configured_block_size) {
  if (configured_block_size > 0) {
    return configured_block_size;
  }

  const u64 derived = static_cast<u64>(std::min<std::size_t>(16, std::max<std::size_t>(4, n)));
  return derived == 0 ? 1 : derived;
}

void write_bsm_artifact(const InputPayload& payload, const Options& options) {
  const std::size_t n_size_t = payload.symbols.size();
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
    lower_row.assign(i + 1, 0.0);

    for (std::size_t j = 0; j <= i; ++j) {
      lower_row[j] = payload.dense_scores[i][j];
    }

    writer.append(std::span<const double>(lower_row.data(), lower_row.size()));
  }

  matrix.flush();
}

} // namespace

int main(int argc, char** argv) {
  try {
    const Options options = parse_args(argc, argv);
    const InputPayload payload = read_payload_from_stdin();

    validate_payload(payload, options.symmetry_tolerance);
    write_bsm_artifact(payload, options);

    std::cout
        << "Wrote " << payload.symbols.size()
        << "x" << payload.symbols.size()
        << " matrix artifact to " << options.output_path.string()
        << '\n';

    return 0;
  } catch (const std::exception& ex) {
    std::cerr << "risk_atlas_bsm_writer failed: " << ex.what() << '\n';
    return 1;
  }
}