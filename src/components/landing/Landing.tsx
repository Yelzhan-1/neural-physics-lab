"use client";

import { motion, type Variants } from "motion/react";
import { ArrowDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { PendulumScene } from "@/components/scene/PendulumScene";
import { SLOTS, type SlotId } from "@/components/scene/runtime";
import { useLabRuntime } from "@/components/scene/useLabRuntime";
import { SpotlightCard } from "@/components/site/SpotlightCard";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const PHYSICS_ONLY: readonly SlotId[] = ["physics"];
const HEADLINE = ["AI", "that", "learns", "from", "the"];
const HEADLINE_ACCENT = ["laws", "of", "nature"];

const word: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(14px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease: EASE } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 26, filter: "blur(10px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE } },
};

const stagger: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

function OpenLabButton({ className }: { className?: string }) {
  return (
    <Link
      href="/lab"
      className={cn(
        "beam group inline-flex h-12 items-center gap-2.5 rounded-full bg-[#070b18] px-7 text-[15px] font-semibold text-white shadow-[0_0_44px_-10px_var(--physics)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_60px_-8px_var(--physics)] active:translate-y-0",
        className,
      )}
    >
      Open the Lab
      <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

export function Landing() {
  const runtime = useLabRuntime({ trailLength: 1500 });

  useEffect(() => {
    runtime.setSpeed(0.85);
    runtime.setInitialAngles((120 * Math.PI) / 180, (-20 * Math.PI) / 180);
  }, [runtime]);

  return (
    <main className="flex-1">
      <section className="relative -mt-[76px] flex min-h-[max(100svh,680px)] flex-col items-center justify-center overflow-hidden px-5 pt-[76px] text-center">
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
          className="absolute inset-0"
        >
          <PendulumScene
            runtime={runtime}
            slots={PHYSICS_ONLY}
            showLabels={false}
            showGuides={false}
            zoom={1.5}
            pivotY={0.4}
            trailWidth={2.2}
            ariaLabel="Live double pendulum simulated by the physics engine"
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_46%_at_50%_52%,rgb(4_5_13/82%),rgb(4_5_13/38%)_58%,transparent_82%)]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="shown"
          className="relative z-10 flex max-w-5xl flex-col items-center"
        >
          <motion.p
            variants={rise}
            className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium tracking-wide text-white/75 backdrop-blur-md"
          >
            <span className="size-1.5 rounded-full bg-physics shadow-[0_0_10px_var(--physics)]" />
            KIMEP AI Challenge 2026
          </motion.p>

          <h1 className="text-[clamp(2.7rem,8.6vw,6.5rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance text-white">
            {HEADLINE.map((text) => (
              <motion.span key={text} variants={word} className="mr-[0.22em] inline-block">
                {text}
              </motion.span>
            ))}
            <br />
            {HEADLINE_ACCENT.map((text, index) => (
              <motion.span
                key={text}
                variants={word}
                className={cn(
                  "text-aurora inline-block pb-[0.08em]",
                  index < HEADLINE_ACCENT.length - 1 && "mr-[0.22em]",
                )}
              >
                {text}
              </motion.span>
            ))}
          </h1>

          <motion.p
            variants={rise}
            className="mt-7 max-w-2xl text-base leading-relaxed text-pretty text-white/70 sm:text-lg"
          >
            Does AI predict motion better when it learns the laws of physics, not only data? We
            put the question to a double pendulum, the same mathematics that moves a two-link
            robot arm.
          </motion.p>

          <motion.div variants={rise} className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <OpenLabButton />
            <a
              href="#problem"
              className="group inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-white/70 transition-colors hover:text-white"
            >
              How it works
              <ArrowDown className="size-4 transition-transform duration-300 group-hover:translate-y-0.5" />
            </a>
          </motion.div>

          <motion.ul
            variants={rise}
            className="mt-14 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-xs text-white/55"
          >
            {SLOTS.map((slot) => (
              <li key={slot.id} className="flex items-center gap-2">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: slot.color, boxShadow: `0 0 10px ${slot.color}` }}
                />
                {slot.label}
              </li>
            ))}
          </motion.ul>
        </motion.div>
      </section>

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-28 px-5 py-24 sm:px-8 sm:py-32 lg:gap-40">
        <Chapter
          id="problem"
          index="01"
          eyebrow="The problem"
          title="A robot has to know where it will be next. With very little data."
          body="To move safely, a robot arm must predict its own motion. Recording that motion on real hardware is slow and expensive, so the dataset is always small. A network that has only seen a few examples has nothing to hold on to once the arm leaves them."
        >
          <SpotlightCard className="relative h-[340px] overflow-hidden sm:h-[420px]">
            <PendulumScene
              runtime={runtime}
              view="arm"
              slots={PHYSICS_ONLY}
              showLabels={false}
              zoom={0.96}
              pivotY={0.5}
              ariaLabel="The same motion drawn as a two-link robot arm"
            />
            <p className="absolute bottom-4 left-5 text-xs text-white/50">
              The pendulum above, drawn as a two-link arm
            </p>
          </SpotlightCard>
        </Chapter>

        <Chapter
          id="idea"
          index="02"
          eyebrow="The idea"
          title="Give the network the equations, not only the examples."
          body="A physics-informed neural network (PINN) is trained on the same data as a standard one. The difference is one extra term in its loss: it is penalised whenever its prediction breaks the equations of motion. Physics becomes a training signal in the places where there is no data."
          flip
        >
          <SpotlightCard tint="167 139 250" className="p-6 sm:p-8">
            <div className="grid gap-5">
              <LossRow color="var(--nn)" label="Standard NN">
                L = L<sub>data</sub>
              </LossRow>
              <LossRow color="var(--pinn)" label="PINN">
                L = L<sub>data</sub> + λ · L<sub>physics</sub>
              </LossRow>
            </div>
            <div className="mt-6 border-t border-white/[0.08] pt-6">
              <p className="font-num text-[15px] text-white sm:text-lg">
                L<sub>physics</sub> = ‖ M(θ) α − f(θ, ω) ‖²
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                M(θ) α = f(θ, ω) is the equation of motion of the double pendulum: θ are the
                angles, ω the angular velocities, α the angular accelerations. It is the same
                equation our physics engine integrates.
              </p>
            </div>
          </SpotlightCard>
        </Chapter>

        <section id="experiment" className="scroll-mt-24">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="shown"
            viewport={{ once: true, margin: "-90px" }}
          >
            <ChapterHeading
              index="03"
              eyebrow="The experiment"
              title="Three models. Four experiments. One pendulum."
              body="Every model starts from the same pose and is compared with the same reference motion."
              wide
            />

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {MODELS.map((model) => (
                <motion.div key={model.id} variants={rise} className="h-full">
                  <SpotlightCard tint={model.tint} className="h-full p-6">
                    <span
                      className="block h-px w-12"
                      style={{ background: model.color, boxShadow: `0 0 14px 1px ${model.color}` }}
                    />
                    <h3 className="mt-5 text-lg font-semibold tracking-tight text-white">
                      {model.name}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {model.text}
                    </p>
                    <p className="font-num mt-5 text-[11px] tracking-[0.12em] text-white/45 uppercase">
                      {model.status}
                    </p>
                  </SpotlightCard>
                </motion.div>
              ))}
            </div>

            <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {EXPERIMENTS.map((experiment, index) => (
                <motion.li key={experiment.name} variants={rise}>
                  <div className="group h-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.045]">
                    <span className="font-num text-xs text-white/40 transition-colors group-hover:text-physics">
                      0{index + 1}
                    </span>
                    <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-white">
                      {experiment.name}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {experiment.text}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ol>

            <motion.div variants={rise} className="mt-16 flex flex-col items-center gap-5 text-center">
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                The physics engine is live today. Model training arrives in the lab next.
              </p>
              <OpenLabButton />
            </motion.div>
          </motion.div>
        </section>
      </div>

      <footer className="border-t border-white/[0.06] px-5 py-8 text-center text-xs text-white/40">
        Neural Physics Lab · KIMEP AI Challenge 2026 · Everything runs in your browser
      </footer>
    </main>
  );
}

const MODELS = [
  {
    id: "physics",
    name: "Physics (RK4)",
    color: "var(--physics)",
    tint: "34 211 238",
    text: "Our own solver for the exact equations of motion. It is the reference every prediction is measured against.",
    status: "Running now",
  },
  {
    id: "nn",
    name: "Standard NN",
    color: "var(--nn)",
    tint: "251 146 60",
    text: "A neural network that learns the motion from recorded data and nothing else.",
    status: "Not trained yet",
  },
  {
    id: "pinn",
    name: "PINN",
    color: "var(--pinn)",
    tint: "167 139 250",
    text: "The same network, with the equations of motion added to its loss.",
    status: "Not trained yet",
  },
] as const;

const EXPERIMENTS = [
  { name: "Little data", text: "Train on only a few recorded moments of the motion." },
  { name: "Noisy data", text: "Train on measurements with sensor noise added." },
  { name: "Long horizon", text: "Predict far beyond the time span of the training data." },
  { name: "New start", text: "Predict from a starting pose the model has never seen." },
] as const;

function ChapterHeading({
  index,
  eyebrow,
  title,
  body,
  wide,
}: {
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "max-w-3xl" : undefined}>
      <motion.p
        variants={rise}
        className="flex items-center gap-3 text-xs font-medium tracking-[0.18em] text-physics uppercase"
      >
        <span className="font-num text-white/40">{index}</span>
        <span className="h-px w-8 bg-white/20" />
        {eyebrow}
      </motion.p>
      <motion.h2
        variants={rise}
        className="mt-5 text-[clamp(1.9rem,4.4vw,3.25rem)] leading-[1.06] font-semibold tracking-[-0.035em] text-balance text-white"
      >
        {title}
      </motion.h2>
      <motion.p
        variants={rise}
        className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-white/65"
      >
        {body}
      </motion.p>
    </div>
  );
}

function Chapter({
  id,
  index,
  eyebrow,
  title,
  body,
  flip,
  children,
}: {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  flip?: boolean;
  children: ReactNode;
}) {
  return (
    <motion.section
      id={id}
      variants={stagger}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-90px" }}
      className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16"
    >
      <div className={flip ? "lg:order-2" : undefined}>
        <ChapterHeading index={index} eyebrow={eyebrow} title={title} body={body} />
      </div>
      <motion.div variants={rise} className="min-w-0">
        {children}
      </motion.div>
    </motion.section>
  );
}

function LossRow({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
      <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span
          className="size-1.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}` }}
        />
        {label}
      </span>
      <span className="font-num text-[15px] text-white sm:text-lg">{children}</span>
    </div>
  );
}
