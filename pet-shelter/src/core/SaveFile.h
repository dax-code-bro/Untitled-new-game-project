// Tiny key=value save format (human readable, diff friendly).
#pragma once
#include "core/Math.h"
#include <map>
#include <string>

namespace ps {

class KeyValues {
public:
    void set(const std::string& k, const std::string& v) { kv_[k] = v; }
    void setf(const std::string& k, double v);
    void seti(const std::string& k, long long v) { kv_[k] = std::to_string(v); }
    void setv(const std::string& k, vec3 v);
    bool has(const std::string& k) const { return kv_.count(k) != 0; }
    std::string get(const std::string& k, const std::string& def = {}) const;
    double getf(const std::string& k, double def = 0.0) const;
    long long geti(const std::string& k, long long def = 0) const;
    vec3 getv(const std::string& k, vec3 def = vec3(0.0f)) const;
    bool write(const std::string& path) const;
    bool read(const std::string& path);
    const std::map<std::string, std::string>& all() const { return kv_; }
private:
    std::map<std::string, std::string> kv_;
};

}  // namespace ps
