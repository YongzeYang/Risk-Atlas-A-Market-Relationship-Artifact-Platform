// tools/risk_atlas_bsm_query.cpp
//
// CLI query tool for existing .bsm matrix files.
//
// Commands:
//   metadata                          → JSON { dimension, blockSize }
//   pair-score --row R --col C        → JSON { row, col, score }
//   row-topk --row R --k K           → JSON [{ index, score }, ...]
//   submatrix --indices I,J,K,...     → JSON { indices, scores }
//   compare-top-drift                 → JSON [{ leftPos, rightPos, leftScore, rightScore, delta }, ...]

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "bsm/blocked_symmetric_matrix.hpp"

using BSM = bsm::BlockedSymmetricMatrix<double>;
using index_type = BSM::index_type;

static constexpr index_type DEFAULT_CACHE_BLOCKS = 16;

struct DriftEntry {
  index_type left_pos;
  index_type right_pos;
  double left_score;
  double right_score;
  double delta;
};

static void print_metadata(const BSM& matrix) {
  std::cout << "{\"dimension\":" << matrix.n()
            << ",\"blockSize\":" << matrix.block_size()
            << "}" << std::endl;
}

static void print_pair_score(const BSM& matrix, index_type row, index_type col) {
  if (row >= matrix.n() || col >= matrix.n()) {
    std::cerr << "Index out of range: row=" << row << " col=" << col
              << " dimension=" << matrix.n() << std::endl;
    std::exit(1);
  }
  double score = matrix.value(row, col);
  std::cout << "{\"row\":" << row
            << ",\"col\":" << col
            << ",\"score\":" << score
            << "}" << std::endl;
}

static void print_row_topk(const BSM& matrix, index_type row, int k) {
  if (row >= matrix.n()) {
    std::cerr << "Row index out of range: row=" << row
              << " dimension=" << matrix.n() << std::endl;
    std::exit(1);
  }

  // Read the full row using the symmetric property
  const auto n = matrix.n();
  struct Entry {
    index_type index;
    double score;
  };

  std::vector<Entry> entries;
  entries.reserve(static_cast<std::size_t>(n) - 1);

  for (index_type j = 0; j < n; ++j) {
    if (j == row) continue;
    entries.push_back({j, matrix.value(row, j)});
  }

  // Sort by score descending, then by index ascending for stability.
  // This preserves the API contract used by the existing neighbors surface.
  std::sort(entries.begin(), entries.end(), [](const Entry& a, const Entry& b) {
    if (a.score != b.score) return a.score > b.score;
    return a.index < b.index;
  });

  const auto limit = static_cast<std::size_t>(std::min(k, static_cast<int>(entries.size())));

  std::cout << "[";
  for (std::size_t i = 0; i < limit; ++i) {
    if (i > 0) std::cout << ",";
    std::cout << "{\"index\":" << entries[i].index
              << ",\"score\":" << entries[i].score << "}";
  }
  std::cout << "]" << std::endl;
}

static std::vector<index_type> parse_indices(const std::string& str) {
  std::vector<index_type> result;
  std::istringstream ss(str);
  std::string token;
  while (std::getline(ss, token, ',')) {
    if (!token.empty()) {
      result.push_back(static_cast<index_type>(std::stoull(token)));
    }
  }
  return result;
}

static void print_submatrix(const BSM& matrix, const std::vector<index_type>& indices) {
  for (auto idx : indices) {
    if (idx >= matrix.n()) {
      std::cerr << "Index out of range: " << idx
                << " dimension=" << matrix.n() << std::endl;
      std::exit(1);
    }
  }

  std::cout << "{\"indices\":[";
  for (std::size_t i = 0; i < indices.size(); ++i) {
    if (i > 0) std::cout << ",";
    std::cout << indices[i];
  }
  std::cout << "],\"scores\":[";

  for (std::size_t i = 0; i < indices.size(); ++i) {
    if (i > 0) std::cout << ",";
    std::cout << "[";
    for (std::size_t j = 0; j < indices.size(); ++j) {
      if (j > 0) std::cout << ",";
      std::cout << matrix.value(indices[i], indices[j]);
    }
    std::cout << "]";
  }
  std::cout << "]}" << std::endl;
}

static bool compare_drift_entries(const DriftEntry& a, const DriftEntry& b) {
  const double abs_a = std::abs(a.delta);
  const double abs_b = std::abs(b.delta);
  if (abs_a != abs_b) return abs_a > abs_b;
  if (a.left_pos != b.left_pos) return a.left_pos < b.left_pos;
  return a.right_pos < b.right_pos;
}

static void print_compare_top_drift(
    const BSM& left_matrix,
    const BSM& right_matrix,
    const std::vector<index_type>& left_indices,
    const std::vector<index_type>& right_indices,
    int limit) {
  if (left_indices.size() != right_indices.size()) {
    std::cerr << "compare-top-drift requires left/right index lists of the same length" << std::endl;
    std::exit(1);
  }

  if (left_indices.size() < 2) {
    std::cerr << "compare-top-drift requires at least two common symbols" << std::endl;
    std::exit(1);
  }

  if (limit <= 0) {
    std::cerr << "compare-top-drift requires --limit > 0" << std::endl;
    std::exit(1);
  }

  for (auto idx : left_indices) {
    if (idx >= left_matrix.n()) {
      std::cerr << "Left index out of range: " << idx
                << " dimension=" << left_matrix.n() << std::endl;
      std::exit(1);
    }
  }

  for (auto idx : right_indices) {
    if (idx >= right_matrix.n()) {
      std::cerr << "Right index out of range: " << idx
                << " dimension=" << right_matrix.n() << std::endl;
      std::exit(1);
    }
  }

  std::vector<DriftEntry> top_entries;
  top_entries.reserve(static_cast<std::size_t>(limit));

  for (std::size_t i = 0; i < left_indices.size(); ++i) {
    for (std::size_t j = i + 1; j < left_indices.size(); ++j) {
      const double left_score = left_matrix.value(left_indices[i], left_indices[j]);
      const double right_score = right_matrix.value(right_indices[i], right_indices[j]);

      top_entries.push_back({
          static_cast<index_type>(i),
          static_cast<index_type>(j),
          left_score,
          right_score,
          right_score - left_score});

      std::sort(top_entries.begin(), top_entries.end(), compare_drift_entries);
      if (top_entries.size() > static_cast<std::size_t>(limit)) {
        top_entries.pop_back();
      }
    }
  }

  std::cout << "[";
  for (std::size_t i = 0; i < top_entries.size(); ++i) {
    if (i > 0) std::cout << ",";
    const auto& entry = top_entries[i];
    std::cout << "{\"leftPos\":" << entry.left_pos
              << ",\"rightPos\":" << entry.right_pos
              << ",\"leftScore\":" << entry.left_score
              << ",\"rightScore\":" << entry.right_score
              << ",\"delta\":" << entry.delta
              << "}";
  }
  std::cout << "]" << std::endl;
}

static void usage(const char* progname) {
  std::cerr
      << "Usage: " << progname << " --file <path.bsm> --command <cmd> [args...]\n"
      << "\n"
      << "Commands:\n"
      << "  metadata\n"
      << "  pair-score --row <i> --col <j>\n"
      << "  row-topk --row <i> --k <k>\n"
      << "  submatrix --indices <i,j,k,...>\n"
      << "  compare-top-drift --other-file <path.bsm> --left-indices <i,j,...> --right-indices <i,j,...> --limit <k>\n";
}

int main(int argc, char* argv[]) {
  std::string file_path;
  std::string other_file_path;
  std::string command;
  index_type row = 0;
  index_type col = 0;
  int k = 10;
  int limit = 50;
  std::string indices_str;
  std::string left_indices_str;
  std::string right_indices_str;
  index_type cache_blocks = DEFAULT_CACHE_BLOCKS;

  bool has_row = false;
  bool has_col = false;

  for (int i = 1; i < argc; ++i) {
    std::string arg(argv[i]);
    if (arg == "--file" && i + 1 < argc) {
      file_path = argv[++i];
    } else if (arg == "--other-file" && i + 1 < argc) {
      other_file_path = argv[++i];
    } else if (arg == "--command" && i + 1 < argc) {
      command = argv[++i];
    } else if (arg == "--row" && i + 1 < argc) {
      row = static_cast<index_type>(std::stoull(argv[++i]));
      has_row = true;
    } else if (arg == "--col" && i + 1 < argc) {
      col = static_cast<index_type>(std::stoull(argv[++i]));
      has_col = true;
    } else if (arg == "--k" && i + 1 < argc) {
      k = std::stoi(argv[++i]);
    } else if (arg == "--limit" && i + 1 < argc) {
      limit = std::stoi(argv[++i]);
    } else if (arg == "--indices" && i + 1 < argc) {
      indices_str = argv[++i];
    } else if (arg == "--left-indices" && i + 1 < argc) {
      left_indices_str = argv[++i];
    } else if (arg == "--right-indices" && i + 1 < argc) {
      right_indices_str = argv[++i];
    } else if (arg == "--cache-blocks" && i + 1 < argc) {
      cache_blocks = static_cast<index_type>(std::stoull(argv[++i]));
    } else if (arg == "--help" || arg == "-h") {
      usage(argv[0]);
      return 0;
    } else {
      // Allow command as positional if --command not used
      if (command.empty() && arg[0] != '-') {
        command = arg;
      }
    }
  }

  if (file_path.empty() || command.empty()) {
    usage(argv[0]);
    return 1;
  }

  try {
    auto matrix = BSM::open_file(file_path, cache_blocks);

    if (command == "metadata") {
      print_metadata(matrix);
    } else if (command == "pair-score") {
      if (!has_row || !has_col) {
        std::cerr << "pair-score requires --row and --col" << std::endl;
        return 1;
      }
      print_pair_score(matrix, row, col);
    } else if (command == "row-topk") {
      if (!has_row) {
        std::cerr << "row-topk requires --row" << std::endl;
        return 1;
      }
      print_row_topk(matrix, row, k);
    } else if (command == "submatrix") {
      if (indices_str.empty()) {
        std::cerr << "submatrix requires --indices" << std::endl;
        return 1;
      }
      auto indices = parse_indices(indices_str);
      if (indices.empty()) {
        std::cerr << "submatrix requires at least one index" << std::endl;
        return 1;
      }
      print_submatrix(matrix, indices);
    } else if (command == "compare-top-drift") {
      if (other_file_path.empty()) {
        std::cerr << "compare-top-drift requires --other-file" << std::endl;
        return 1;
      }
      if (left_indices_str.empty() || right_indices_str.empty()) {
        std::cerr << "compare-top-drift requires --left-indices and --right-indices" << std::endl;
        return 1;
      }

      auto left_indices = parse_indices(left_indices_str);
      auto right_indices = parse_indices(right_indices_str);
      auto other_matrix = BSM::open_file(other_file_path, cache_blocks);
      print_compare_top_drift(matrix, other_matrix, left_indices, right_indices, limit);
    } else {
      std::cerr << "Unknown command: " << command << std::endl;
      usage(argv[0]);
      return 1;
    }
  } catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << std::endl;
    return 1;
  }

  return 0;
}
