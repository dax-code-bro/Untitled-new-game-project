// ---------------------------------------------------------------------------
//  Include FIRST in every translation unit whose floating point has to
//  round where JavaScript rounds.
//
//  x86-64 without -mfma never contracts a*b+c into an FMA, so the default
//  build is already exact. But the day someone configures with
//  -march=native, GCC's default -ffp-contract=fast would start fusing, and
//  every recipe would drift from the JS by an ulp here and there -- which
//  is invisible until it lands on a threshold (a mortar edge, a cell
//  boundary) and moves a whole texel. Turning it off here means the parity
//  test keeps meaning something whatever flags the build is given.
// ---------------------------------------------------------------------------
#pragma once

#if defined(__clang__)
#pragma clang fp contract(off)
#elif defined(__GNUC__)
#pragma GCC optimize("fp-contract=off")
#elif defined(_MSC_VER)
#pragma fp_contract(off)
#endif
