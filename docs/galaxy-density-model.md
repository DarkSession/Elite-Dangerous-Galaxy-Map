# Galaxy density model

The map draws the galaxy's shape from a compact analytic model of the game's stellar-mass
distribution. The parameters live in [src/galaxy-model/galaxy-model.json](../src/galaxy-model/galaxy-model.json).
This document gives the formulas the TypeScript port implements. The fixture in
[tests/fixtures/galaxy-model.json](../tests/fixtures/galaxy-model.json) pins the port to
reference values.

The model reproduces the overall size, the bar and bulge, the four spiral arms, the disc
thickness and the relative brightness of every part of the galaxy from a few dozen
numbers. It does not place individual stars. The parameters were fitted to the game's
own density maps. Do not hand-copy the constants; read them from the JSON.

## Coordinates

Game galactic coordinates, light years. `x` right, `y` up out of the disc, `z` from Sol
toward the galactic centre. Sol is `(0, 0, 0)`.

| Quantity | Value |
| --- | --- |
| Galactic centre `(cx, cy, cz)` | `centre` in the JSON: `(15, -35, 25895)` |
| Bounds | `bounds.x`, `bounds.y`, `bounds.z` |
| Disc radius | density falls below 1/10,000 of the centre by 45,000 ly; empty beyond 47,000 |
| Disc thickness | the vertical profile is cut at `max_height_ly` = 2,867 ly from the mid-plane |
| Sol | 25,895 ly from the centre, azimuth 270 degrees, 35 ly above the mid-plane |

Azimuth `theta` is measured in the plane from `+x` toward `+z`:
`theta = atan2(z - cz, x - cx)`.

## Parameter file

| Key | Content |
| --- | --- |
| `format` | `galaxy-density-model-v1` |
| `units` | a description string |
| `centre` | `[cx, cy, cz]` |
| `bounds` | `{x: [lo, hi], y: [lo, hi], z: [lo, hi]}` |
| `reference_radius_ly` | `R_ref`, 26,000 |
| `epsilon` | 300, the offset used in every logarithm of density |
| `surface.bulge` | `amplitude`, `radius`, `exponent`, `axis_ratio`, `bar_angle_deg` |
| `surface.disc` | `amplitude`, `scale_length` |
| `surface.truncation` | `radius`, `width` |
| `surface.arms.pitch` | `g1`, `g2` |
| `surface.arms.gate` | `radius`, `width` |
| `surface.arms.list` | four arms, each `name`, `phase_deg`, `amplitude`, `slope`, `width` |
| `vertical.inner` | `scale_ly`, the sech² component's scale height |
| `vertical.outer` | `scale_ly`, the exponential component's scale height |
| `vertical.transition` | `radius_ly`, `width_ly` |
| `vertical.max_height_ly` | the vertical cut |
| `zone.log_density`, `zone.zone` | a 24-point lookup, `zone(ln(Sigma + epsilon))` |
| `calibration.mc0_budget_msun_per_ly3_per_unit` | converts map units per ly to solar masses per ly³ |
| `correction` | `size` 64, `scale` 3, `values`: 4,096 signed integers in -127 to 127 |

## Surface density

With `u = x - cx`, `v = z - cz`, `R = hypot(u, v)`, `theta = atan2(v, u)` and
`L = ln(max(R, 1) / R_ref)`:

```
Sigma(x, z) = trunc(R) * (bulge + disc) * (1 + arms(R, theta)) / norm(R)
```

**Bulge and bar**, a squashed, rotated generalised Gaussian:

```
u' =  u cos(bar_angle) + v sin(bar_angle)
v' = -u sin(bar_angle) + v cos(bar_angle)
R_bar = hypot(u', v' / axis_ratio)
bulge = A_b * exp(-(R_bar / r_b) ^ n_b)
```

**Disc**: `disc = A_d * exp(-R / r_d)`.

**Truncation**: `trunc = 1 / (1 + exp((R - r_t) / w_t))`.

**Arms**, four logarithmic spirals that share one winding law:

```
g(L)       = g1 * L + g2 * L^2                shared winding, radians
theta_i(R) = phase_i + g(L)                    centre line of arm i
slope      = max(g1 + 2 g2 L, 0.1)
cos_pitch  = slope / sqrt(1 + slope^2)
pitch      = atan(1 / slope)                   local pitch angle, tightens outward
```

Each arm is a Gaussian in perpendicular distance from its centre line, with an
amplitude that varies as a power of radius:

```
offset_i = clamp(wrap(theta - theta_i(R)), -pi/2, pi/2)    wrap into (-pi, pi]
d_i      = R * sin(offset_i) * cos_pitch
gate     = 1 / (1 + exp(-(R - gate_radius) / gate_width))
a_i      = amplitude_i * exp(slope_i * L) * gate
arms     = sum_i a_i * exp(-0.5 * (d_i / width_i)^2)
norm     = 1 + sum_i a_i * min(1, width_i / (max(R, 1) * cos_pitch * sqrt(2 pi)))
```

`norm` is the azimuthal mean of the arm term, so the arms redistribute mass around each
ring without changing the radial profile much. The arm centre line at radius `R` is
`arm_point(i, R) = (cx + R cos theta_i(R), cz + R sin theta_i(R))`.

The logistic `1 / (1 + exp(-t))` returns 1 for `t > 60` and 0 for `t < -60`.

Units are the map's own: Sol is about 2.5e4, the galactic centre about 1.2e7, the
inner edge of the arms 1e5 to 1e6, the outer rim 1e3 and below. Take the logarithm
before mapping to brightness.

## Correction grid

The grid stores `ln((data + epsilon) / (model + epsilon))` per cell, quantised to
-127 to 127 over -3 to 3. Sample it bilinearly:

```
fx = clamp((x - x_lo) / (x_hi - x_lo) * size - 0.5, 0, size - 1)
fz = clamp((z - z_lo) / (z_hi - z_lo) * size - 0.5, 0, size - 1)
ix = floor(fx), jx = min(ix + 1, size - 1), tx = fx - ix     (same for z)
value = bilinear(values[iz * size + ix], values[iz * size + jx],
                 values[jz * size + ix], values[jz * size + jx]) * scale / 127
Sigma_corrected = max(0, (Sigma + epsilon) * exp(value) - epsilon)
```

The grid rows run along `z` and columns along `x`.

## Vertical profile

```
dy    = y - cy
w(R)  = 1 / (1 + exp((R - transition.radius_ly) / transition.width_ly))
rho_y = w * sech(dy / h_in)^2 / (2 h_in)  +  (1 - w) * exp(-|dy| / h_out) / (2 h_out)
```

`rho_y` is the fraction of a column's mass per light year and integrates to 1 over all
heights. It is 0 for `|dy| > max_height_ly`. The half-mass height, the height that holds
half of each side's mass, is `h_in * atanh(0.5)` = 483 ly where the inner component
dominates and `h_out * ln 2` = 230 ly where the outer one does. Find it by bisection on
the blended survival function `w (1 - tanh(h / h_in)) + (1 - w) exp(-h / h_out)`.

## Volume density and mass density

```
rho(x, y, z) = Sigma_corrected(x, z) * rho_y(y - cy, R)         map units per ly
M0(x, y, z)  = rho * calibration.mc0_budget_msun_per_ly3_per_unit  solar masses per ly³
```

`M0` is the game's smallest mass-code generation budget. Measured system counts per
1,000 cubic light years: 3.8 at Sol, 0.27 at Sol plus 500 ly, 8.5 at Colonia, 73 at
2,000 ly from the core. About 4 systems per solar mass of budget in the disc; about 1
in the densest parts. Summed over the galaxy the budget corresponds to a few hundred
billion systems.

## Population zone

`zone = lookup(ln(Sigma_corrected + epsilon))`, linear between the 24 points, clamped
at the ends. Values run from 0 in the outer disc to about 0.8 in the core. The map uses
it only as a tint.

## Accuracy

Root-mean-square error of `ln(Sigma + epsilon)` inside 44,000 ly, against the game's
map at 256-cell resolution: about 0.7 for the formulas alone and about 0.2 with the
correction grid, a factor of about 1.2. The arm positions, the bar and the radial
profile are right. Hand-painted clumps are smoothed.
