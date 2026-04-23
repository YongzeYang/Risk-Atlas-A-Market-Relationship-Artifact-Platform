#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <optional>
#include <span>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "bsm/append_row_writer.hpp"
#include "bsm/blocked_symmetric_matrix.hpp"

namespace {

using u64 = std::uint64_t;
namespace fs = std::filesystem;

constexpr const char* PROGRESS_VERSION = "1";

struct Options {
  fs::path output_path;
  fs::path progress_path;
  fs::path seed_from_path;
  std::string build_run_id;
  std::string symbol_set_hash;
  std::string as_of_date;
  std::string score_method;
  std::string source_dataset_max_trade_date;
  u64 window_days{0};
  u64 start_row{0};
  u64 seed_rows{0};
  u64 block_size{0};
  u64 cache_blocks{8};
};

struct ProgressState {
  std::string build_run_id;
  std::string symbol_set_hash;
  std::string as_of_date;
  std::string score_method;
  std::string source_dataset_max_trade_date;
  u64 window_days{0};
  u64 symbol_count{0};
  u64 next_row{0};
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
    throw std::overflow_error(std::string("Value overflows uint64_t for ") + name + '.');
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
      << "Usage: " << argv0
      << " --output <path> --progress <path> --build-run-id <id> --symbol-set-hash <hash>"
      << " --as-of-date <yyyy-mm-dd> --score-method <method> --window-days <n>"
      << " [--source-dataset-max-trade-date <yyyy-mm-dd>] [--start-row <n>]"
      << " [--seed-from <path>] [--seed-rows <n>]"
      << " [--block-size <n>] [--cache-blocks <n>]\n\n"
      << "Reads a lower-triangle streaming payload from stdin:\n"
      << "  line 1: N\n"
      << "  next N lines: symbol strings\n"
      << "  next N - max(start_row, seed_rows) lines: row i has i+1 whitespace-separated doubles (j=0..i)\n";
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
    } else if (arg == "--progress") {
      options.progress_path = value;
    } else if (arg == "--seed-from") {
      options.seed_from_path = value;
    } else if (arg == "--build-run-id") {
      options.build_run_id = value;
    } else if (arg == "--symbol-set-hash") {
      options.symbol_set_hash = value;
    } else if (arg == "--as-of-date") {
      options.as_of_date = value;
    } else if (arg == "--score-method") {
      options.score_method = value;
    } else if (arg == "--source-dataset-max-trade-date") {
      options.source_dataset_max_trade_date = value;
    } else if (arg == "--window-days") {
      options.window_days = parse_u64(value, "window-days");
    } else if (arg == "--start-row") {
      options.start_row = parse_u64(value, "start-row");
    } else if (arg == "--seed-rows") {
      options.seed_rows = parse_u64(value, "seed-rows");
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

  if (options.progress_path.empty()) {
    throw std::invalid_argument("Missing required --progress <path> argument.");
  }

  if (options.build_run_id.empty()) {
    throw std::invalid_argument("Missing required --build-run-id <id> argument.");
  }

  if (options.symbol_set_hash.empty()) {
    throw std::invalid_argument("Missing required --symbol-set-hash <hash> argument.");
  }

  if (options.as_of_date.empty()) {
    throw std::invalid_argument("Missing required --as-of-date <yyyy-mm-dd> argument.");
  }

  if (options.score_method.empty()) {
    throw std::invalid_argument("Missing required --score-method <method> argument.");
  }

  if (options.window_days == 0) {
    throw std::invalid_argument("--window-days must be > 0.");
  }

  if (options.cache_blocks == 0) {
    throw std::invalid_argument("--cache-blocks must be > 0.");
  }

  if (options.seed_rows > 0 && options.seed_from_path.empty()) {
    throw std::invalid_argument("--seed-from is required when --seed-rows > 0.");
  }

  if (options.seed_rows > 0 && options.start_row != 0) {
    throw std::invalid_argument("--seed-rows can only be used when --start-row is 0.");
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
      throw std::runtime_error("Failed to read symbol line " + std::to_string(i) + '.');
    }

    if (!symbol.empty() && symbol.back() == '\r') {
      symbol.pop_back();
    }

    if (symbol.empty()) {
      throw std::runtime_error("Encountered empty symbol at index " + std::to_string(i) + '.');
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
  std::getline(std::cin, dummy);

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

[[nodiscard]] std::optional<ProgressState> read_progress_file(const fs::path& path) {
  if (!fs::exists(path)) {
    return std::nullopt;
  }

  std::ifstream input(path);
  if (!input.is_open()) {
    throw std::runtime_error("Failed to open progress file for reading: " + path.string());
  }

  std::unordered_map<std::string, std::string> values;
  std::string line;
  while (std::getline(input, line)) {
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }

    if (line.empty()) {
      continue;
    }

    const std::size_t separator = line.find('=');
    if (separator == std::string::npos) {
      throw std::runtime_error("Malformed progress file line: " + line);
    }

    values[line.substr(0, separator)] = line.substr(separator + 1);
  }

  if (values["version"] != PROGRESS_VERSION) {
    throw std::runtime_error("Unsupported progress file version in: " + path.string());
  }

  ProgressState state;
  state.build_run_id = values["build_run_id"];
  state.symbol_set_hash = values["symbol_set_hash"];
  state.as_of_date = values["as_of_date"];
  state.score_method = values["score_method"];
  state.source_dataset_max_trade_date = values["source_dataset_max_trade_date"];
  state.window_days = parse_u64(values["window_days"], "progress window_days");
  state.symbol_count = parse_u64(values["symbol_count"], "progress symbol_count");
  state.next_row = parse_u64(values["next_row"], "progress next_row");
  return state;
}

void write_progress_file(const fs::path& path, const ProgressState& state) {
  if (const auto parent = path.parent_path(); !parent.empty()) {
    fs::create_directories(parent);
  }

  const fs::path temp_path = path.string() + ".tmp";
  std::ofstream output(temp_path);
  if (!output.is_open()) {
    throw std::runtime_error("Failed to open progress file for writing: " + temp_path.string());
  }

  output << "version=" << PROGRESS_VERSION << '\n';
  output << "build_run_id=" << state.build_run_id << '\n';
  output << "symbol_set_hash=" << state.symbol_set_hash << '\n';
  output << "as_of_date=" << state.as_of_date << '\n';
  output << "score_method=" << state.score_method << '\n';
  output << "window_days=" << state.window_days << '\n';
  output << "source_dataset_max_trade_date=" << state.source_dataset_max_trade_date << '\n';
  output << "symbol_count=" << state.symbol_count << '\n';
  output << "next_row=" << state.next_row << '\n';

  output.flush();
  if (!output) {
    throw std::runtime_error("Failed to flush progress file: " + temp_path.string());
  }

  output.close();
  fs::rename(temp_path, path);
}

[[nodiscard]] ProgressState make_progress_state(const Options& options, u64 symbol_count, u64 next_row) {
  return ProgressState{
      options.build_run_id,
      options.symbol_set_hash,
      options.as_of_date,
      options.score_method,
      options.source_dataset_max_trade_date,
      options.window_days,
      symbol_count,
      next_row,
  };
}

void validate_existing_progress(
    const ProgressState& state,
    const Options& options,
    u64 symbol_count) {
  if (state.build_run_id != options.build_run_id) {
    throw std::runtime_error("Progress file build_run_id does not match current build.");
  }

  if (state.symbol_set_hash != options.symbol_set_hash) {
    throw std::runtime_error("Progress file symbol_set_hash does not match current build.");
  }

  if (state.as_of_date != options.as_of_date) {
    throw std::runtime_error("Progress file as_of_date does not match current build.");
  }

  if (state.score_method != options.score_method) {
    throw std::runtime_error("Progress file score_method does not match current build.");
  }

  if (state.window_days != options.window_days) {
    throw std::runtime_error("Progress file window_days does not match current build.");
  }

  if (state.source_dataset_max_trade_date != options.source_dataset_max_trade_date) {
    throw std::runtime_error(
        "Progress file source_dataset_max_trade_date does not match current build.");
  }

  if (state.symbol_count != symbol_count) {
    throw std::runtime_error("Progress file symbol_count does not match current build.");
  }

  if (state.next_row != options.start_row) {
    throw std::runtime_error("Progress file next_row does not match requested --start-row.");
  }

  if (state.next_row > symbol_count) {
    throw std::runtime_error("Progress file next_row exceeds the matrix dimension.");
  }
}

template <typename Writer>
void append_remaining_rows(
    Writer& writer,
    u64 start_row,
    u64 total_rows,
    const fs::path& progress_path,
    const Options& options) {
  std::vector<double> lower_row;
  lower_row.reserve(total_rows);

  for (u64 row = start_row; row < total_rows; ++row) {
    std::string row_text;
    if (!std::getline(std::cin, row_text)) {
      throw std::runtime_error("Failed to read lower-triangle row " + std::to_string(row) + '.');
    }

    if (!row_text.empty() && row_text.back() == '\r') {
      row_text.pop_back();
    }

    std::istringstream row_stream(row_text);
    lower_row.assign(static_cast<std::size_t>(row) + 1U, 0.0);

    for (u64 col = 0; col <= row; ++col) {
      std::string token;
      if (!(row_stream >> token)) {
        throw std::runtime_error(
            "Row " + std::to_string(row) +
            " has fewer values than expected; required " + std::to_string(row + 1) + " values.");
      }

      lower_row[static_cast<std::size_t>(col)] = parse_double(token, "lower-triangle value");
    }

    std::string extra_token;
    if (row_stream >> extra_token) {
      throw std::runtime_error(
          "Row " + std::to_string(row) +
          " has extra trailing values beyond " + std::to_string(row + 1) + '.');
    }

    writer.append_at(row, std::span<const double>(lower_row.data(), lower_row.size()));
    write_progress_file(progress_path, make_progress_state(options, total_rows, row + 1));
  }

  std::string trailing_token;
  if (std::cin >> trailing_token) {
    throw std::runtime_error("Unexpected trailing tokens after lower-triangle rows.");
  }
}

template <typename Matrix, typename Writer>
void seed_rows_from_parent_matrix(
    const Matrix& seed_matrix,
    Writer& writer,
    u64 seed_rows,
    const fs::path& progress_path,
    const Options& options,
    u64 symbol_count) {
  std::vector<double> lower_row;

  for (u64 row = 0; row < seed_rows; ++row) {
    lower_row.assign(static_cast<std::size_t>(row) + 1U, 0.0);

    for (u64 col = 0; col <= row; ++col) {
      lower_row[static_cast<std::size_t>(col)] = seed_matrix.value(row, col);
    }

    writer.append_at(row, std::span<const double>(lower_row.data(), lower_row.size()));
    write_progress_file(progress_path, make_progress_state(options, symbol_count, row + 1));
  }
}

void build_or_resume_matrix(const std::vector<std::string>& symbols, const Options& options) {
  const u64 symbol_count = static_cast<u64>(symbols.size());
  const u64 block_size = derive_block_size(symbols.size(), options.block_size);

  if (options.start_row > symbol_count) {
    throw std::runtime_error("--start-row exceeds the matrix dimension.");
  }

  if (options.seed_rows > symbol_count) {
    throw std::runtime_error("--seed-rows exceeds the matrix dimension.");
  }

  const auto existing_progress = read_progress_file(options.progress_path);
  if (existing_progress.has_value()) {
    validate_existing_progress(*existing_progress, options, symbol_count);
  } else if (options.start_row != 0) {
    throw std::runtime_error("Requested --start-row > 0 but no progress file exists.");
  }

  if (options.start_row == symbol_count) {
    if (!fs::exists(options.output_path)) {
      throw std::runtime_error("Progress indicates a complete matrix, but the output file is missing.");
    }

    write_progress_file(options.progress_path, make_progress_state(options, symbol_count, symbol_count));
    return;
  }

  if (const auto output_parent = options.output_path.parent_path(); !output_parent.empty()) {
    fs::create_directories(output_parent);
  }

  if (options.start_row == 0) {
    fs::remove(options.output_path);

    auto matrix = bsm::BlockedSymmetricMatrix<double>::create_file(
        options.output_path,
        symbol_count,
        block_size,
        options.cache_blocks);

    bsm::AppendRowWriter<double> writer(matrix);

    u64 next_row = 0;

    if (options.seed_rows > 0) {
      if (!fs::exists(options.seed_from_path)) {
        throw std::runtime_error(
            "Cannot seed from parent matrix because the seed file does not exist.");
      }

      auto seed_matrix = bsm::BlockedSymmetricMatrix<double>::open_file(
          options.seed_from_path,
          options.cache_blocks);

        if (seed_matrix.n() < options.seed_rows) {
        throw std::runtime_error(
          "Parent matrix does not contain enough prefix rows for the requested seed_rows.");
      }

      seed_rows_from_parent_matrix(
          seed_matrix,
          writer,
          options.seed_rows,
          options.progress_path,
          options,
          symbol_count);
      next_row = options.seed_rows;
    }

    append_remaining_rows(writer, next_row, symbol_count, options.progress_path, options);
    matrix.flush();
    return;
  }

  if (!fs::exists(options.output_path)) {
    throw std::runtime_error("Cannot resume because the output matrix file does not exist.");
  }

  auto matrix = bsm::BlockedSymmetricMatrix<double>::open_file(
      options.output_path,
      options.cache_blocks);

  bsm::AppendRowWriter<double> writer(matrix, options.start_row);
  append_remaining_rows(writer, options.start_row, symbol_count, options.progress_path, options);
  matrix.flush();
}

} // namespace

int main(int argc, char** argv) {
  try {
    const Options options = parse_args(argc, argv);
    const std::vector<std::string> symbols = read_header_from_stdin();

    build_or_resume_matrix(symbols, options);

    std::cout
        << "Incremental builder advanced build-run " << options.build_run_id
        << " to next_row=" << symbols.size()
        << " at " << options.output_path.string()
        << '\n';

    return 0;
  } catch (const std::exception& ex) {
    std::cerr << "risk_atlas_bsm_incremental_builder failed: " << ex.what() << '\n';
    return 1;
  }
}