// The 40 people you can recruit. Each is unique: name, looks, bio, work
// history and - for some - a bad history you'd want to know about.
#pragma once
#include "game/Character.h"
#include "game/Staff.h"
#include <string>
#include <vector>

namespace ps {

struct Person {
    int id = 0;
    std::string name;
    Gender gender = Gender::Male;
    int age = 30;
    Role role = Role::Caretaker;
    float skill = 0.5f;          // 0..1
    float wageAsk = 1.0f;        // x market wage
    std::string bio;
    std::string experience;      // past workplaces
    std::string badHistory;      // empty = clean
    Appearance looks;
};

const std::vector<Person>& peopleRoster();
const Person* findPerson(int id);

}  // namespace ps
