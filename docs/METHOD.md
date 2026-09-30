# Method and numerical limits

APD Visualizer compares a scalar function of one or two inputs with two models at a reference point $x_0$: a continuous piecewise affine APD model and a single affine AD model. It implements **single-reference tangent mode**. All calculations run in the browser.

## APD propagation

Let $\bar v_i$ be the value of node $i$ when the original expression is evaluated at $x_0$, and let $P_i(x)$ be its propagated model. Input nodes keep their coordinates and constant nodes keep their values. A smooth elemental operation $v_i=\varphi(v_{j_1},\ldots,v_{j_k})$ becomes

$$
P_i(x)=\varphi(\bar v_{j_1},\ldots,\bar v_{j_k})
+\sum_{\ell=1}^{k}\partial_\ell\varphi(\bar v_{j_1},\ldots,\bar v_{j_k})\bigl(P_{j_\ell}(x)-\bar v_{j_\ell}\bigr).
$$

Absolute value, ReLU, minimum, and maximum act directly on the propagated models:

| Original node | APD model             |
| ------------- | --------------------- |
| `abs(u)`      | $\lvert P_u(x)\rvert$ |
| `relu(u)`     | $\max(0,P_u(x))$      |
| `min(u,v)`    | $\min(P_u(x),P_v(x))$ |
| `max(u,v)`    | $\max(P_u(x),P_v(x))$ |

Smooth coefficients stay frozen at the original reference values throughout the graph. Products, quotients, and powers follow the smooth rule too. In particular, the model of a product is

$$
P_{uv}(x)=\bar u\bar v+\bar v\bigl(P_u(x)-\bar u\bigr)+\bar u\bigl(P_v(x)-\bar v\bigr).
$$

The output model satisfies $P(x_0)=f(x_0)$ in exact arithmetic. This construction follows the tangent rules in [Griewank et al., Section 2](https://arxiv.org/html/1701.04368#S2). Under the paper's local regularity assumptions, including locally Lipschitz continuous derivatives of the smooth elementals, its local remainder is $O(\lVert x-x_0\rVert^2)$; the app does not compute a certified error bound. See [Proposition 3.2](https://arxiv.org/html/1701.04368#S3).

## AD comparison and kink conventions

Forward AD computes a slope or gradient $g$ and displays

$$
A(x)=f(x_0)+g^{\mathsf T}(x-x_0).
$$

For a graph containing only smooth operations, APD and AD give the same affine model. At a switching point, AD uses the selected convention $s\in\{-1,0,1\}$ for `abs` at zero. The default is $s=0$.

ReLU and min/max use the identities `relu(u) = (u + abs(u))/2` and `max/min(u,v) = (u + v ± abs(u-v))/2`. Therefore:

| Operation at a tie | AD rule                     |
| ------------------ | --------------------------- |
| `abs(0)`           | Slope $s$                   |
| `relu(0)`          | Slope $(1+s)/2$             |
| `max(u,v)`, $u=v$  | Weights $((1+s)/2,(1-s)/2)$ |
| `min(u,v)`, $u=v$  | Weights $((1-s)/2,(1+s)/2)$ |

These are implementation conventions. A chosen AD slope is not a unique derivative at a kink, and another AD library may choose different rules. Changing this setting changes AD; APD keeps the switching operations.

### Example

For `abs(x) + 0.25*x^2` at $x_0=0$,

$$
P(x)=|x|,\qquad A(x)=s\,x.
$$

The default AD model is the horizontal zero line, while APD preserves the corner.

The computational expression also matters. At $x_0=1$, `x^2` gives $P(x)=2x-1$, while `abs(x)^2` gives $P(x)=2|x|-1$. These models agree near the reference but differ elsewhere. The parser does not algebraically simplify the input expression.

## Expression syntax

| Category             | Supported syntax                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Variables            | `x`; also `y` in two-input mode                                                                 |
| Constants            | `pi`, `e`; `π` is accepted as `pi`                                                              |
| Arithmetic           | `+`, `-`, `*`, `/`, parentheses                                                                 |
| Powers               | `x^2`, `x**2`, `pow(x,2)`                                                                       |
| Switching operations | `abs`, `relu`, `min(a,b)`, `max(a,b)`                                                           |
| Smooth functions     | `sin`, `cos`, `tan`, `exp`, `log`, `ln`, `sqrt`, `sinh`, `cosh`, `tanh`, `atan`, `asin`, `acos` |

Multiplication must be explicit: `2*x`. Powers associate to the right; `-x^2` means `-(x^2)`. Trigonometric arguments are in radians, and `log`/`ln` mean the natural logarithm. Decimal and scientific notation are supported. Press Enter to update; Shift+Enter inserts a line break.

Expressions are parsed by a restricted mathematical parser. Python or JavaScript code, conditionals, and `floor`/`ceil` are unsupported. The parser bounds input length, node count, and nesting depth to protect responsiveness.

## Domains and rendering

Every intermediate value and every required smooth derivative must be finite at the reference. For example, `sqrt(x^2)` at zero is rejected because its square-root node has no finite derivative there; `abs(x)` expresses the intended cusp directly. Fractional powers at a zero reference base are rejected because the base has no open smooth real neighborhood. Constant integer powers admit negative bases; variable exponents require a positive base at the reference.

APD curves and cross-sections are split at their computed switching points. For two inputs, switching lines clip convex polygons and the resulting affine regions are triangulated. This construction resolves APD creases up to floating-point arithmetic. It stops with an explicit error above 12,000 line pieces or 6,000 surface regions.

Original curves use 701 samples plus APD breakpoints and the reference. Original surfaces and error maps use a 77-by-77 grid plus reference coordinates. Their displayed errors describe those samples. Narrow features or multiple poles between adjacent samples can be missed; reduce the visible domain to inspect them. Domain signatures and midpoint checks separate common poles, and invalid original values appear as gaps. The affine models may extend beyond the original function's domain.

The app uses ordinary floating-point arithmetic. Overflow, cancellation, and loss of small features remain possible for poorly scaled expressions. Local approximation errors may grow far from the reference. The 3D views require WebGL; curves and cross-sections use SVG. Displayed model coefficients are rounded to seven significant digits; plot calculations use full floating-point precision.

## References

- Andreas Griewank, Tom Streubel, Lutz Lehmann, Manuel Radons, and Richard Hasenfelder. [Piecewise Linear Secant Approximation via Algorithmic Piecewise Differentiation](https://arxiv.org/abs/1701.04368), 2017. Section 2 also defines the tangent construction implemented here.
- Andreas Griewank. [On stable piecewise linearization and generalized algorithmic differentiation](https://doi.org/10.1080/10556788.2013.796683), _Optimization Methods and Software_, 2013.
- [Plotly.js surface documentation](https://plotly.com/javascript/3d-surface-plots/).
